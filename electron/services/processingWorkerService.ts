import type Database from 'better-sqlite3'
import { extractAndPersistAiSuggestions } from './aiExtractService'
import {
  claimNextProcessingTask,
  completeProcessingTask,
  createProcessingTask,
  failProcessingTask,
  skipProcessingTask,
  type ProcessingTaskSummary,
  type ProcessingTaskType,
} from './processingQueueService'
import { extractTextFromFile } from './textExtractService'

export interface ProcessingWorkerResult {
  task: ProcessingTaskSummary | null
  createdTask: ProcessingTaskSummary | null
}

export interface ProcessingBatchResult {
  maxTasks: number
  processedTasks: number
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  remainingPendingTasks: number
  results: ProcessingWorkerResult[]
}

interface FileTaskRow {
  id: string
  original_path: string
  file_name: string
  ext: string | null
  parent_folder: string | null
  ocr_text: string | null
  sha256: string | null
  process_status: string | null
  source_batch_id: string | null
  default_primary_category: string | null
  default_region: string | null
}

export async function executeNextProcessingTask(
  db: Database.Database,
  taskType?: ProcessingTaskType,
): Promise<ProcessingWorkerResult> {
  const task = claimNextProcessingTask(db, taskType)

  if (!task) {
    return {
      task: null,
      createdTask: null,
    }
  }

  if (task.taskType === 'ocr') {
    return executeOcrTask(db, task)
  }

  if (task.taskType === 'ai_extract') {
    return executeAiExtractTask(db, task)
  }

  return {
    task: skipProcessingTask(db, task.id, `暂未支持的任务类型：${task.taskType}`),
    createdTask: null,
  }
}

export async function executeProcessingBatch(
  db: Database.Database,
  maxTasks = 10,
  taskType?: ProcessingTaskType,
): Promise<ProcessingBatchResult> {
  const safeMaxTasks = Math.min(Math.max(Math.trunc(maxTasks), 1), 100)
  const results: ProcessingWorkerResult[] = []

  for (let index = 0; index < safeMaxTasks; index += 1) {
    const result = await executeNextProcessingTask(db, taskType)

    if (!result.task) {
      break
    }

    results.push(result)
  }

  return {
    maxTasks: safeMaxTasks,
    processedTasks: results.length,
    completedTasks: countTasksByStatus(results, 'completed'),
    failedTasks: countTasksByStatus(results, 'failed'),
    skippedTasks: countTasksByStatus(results, 'skipped'),
    remainingPendingTasks: countPendingTasks(db, taskType),
    results,
  }
}

async function executeOcrTask(
  db: Database.Database,
  task: ProcessingTaskSummary,
): Promise<ProcessingWorkerResult> {
  const file = task.fileId ? getFileForTask(db, task.fileId) : null

  if (!file) {
    return {
      task: failProcessingTask(db, task.id, '任务缺少可处理的文件'),
      createdTask: null,
    }
  }

  const skipReason = getUnprocessableFileReason(file)
  if (skipReason) {
    return {
      task: skipProcessingTask(db, task.id, skipReason),
      createdTask: null,
    }
  }

  const extraction = await extractTextFromFile(file.original_path, file.ext ?? '')
  const processStatus = extraction.status === 'failed' ? 'ocr_failed' : extraction.processStatus
  const processError = extraction.error
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE files
    SET
      ocr_text = @ocrText,
      ocr_status = @ocrStatus,
      process_status = @processStatus,
      process_error = @processError,
      updated_at = @updatedAt
    WHERE id = @fileId
  `).run({
    ocrText: extraction.text,
    ocrStatus: extraction.status,
    processStatus,
    processError,
    updatedAt: now,
    fileId: file.id,
  })

  if (extraction.status === 'failed') {
    return {
      task: failProcessingTask(db, task.id, extraction.error ?? 'OCR / 文本提取失败'),
      createdTask: null,
    }
  }

  const completedTask = completeProcessingTask(db, task.id, extraction.status)

  if (!extraction.text.trim()) {
    const skippedAiTask = createProcessingTask(db, {
      taskType: 'ai_extract',
      fileId: file.id,
      batchId: file.source_batch_id,
      status: 'skipped',
      resultSummary: 'empty_ocr_text',
    })

    return {
      task: completedTask,
      createdTask: skippedAiTask,
    }
  }

  const aiTask = createProcessingTask(db, {
    taskType: 'ai_extract',
    fileId: file.id,
    batchId: file.source_batch_id,
    status: 'pending',
  })

  return {
    task: completedTask,
    createdTask: aiTask,
  }
}

async function executeAiExtractTask(
  db: Database.Database,
  task: ProcessingTaskSummary,
): Promise<ProcessingWorkerResult> {
  const file = task.fileId ? getFileForTask(db, task.fileId) : null

  if (!file) {
    return {
      task: failProcessingTask(db, task.id, '任务缺少可处理的文件'),
      createdTask: null,
    }
  }

  const skipReason = getUnprocessableFileReason(file)
  if (skipReason) {
    updateFileProcessStatus(db, file.id, 'ai_skipped', skipReason)

    return {
      task: skipProcessingTask(db, task.id, skipReason),
      createdTask: null,
    }
  }

  if (!file.ocr_text?.trim()) {
    updateFileProcessStatus(db, file.id, 'ai_skipped', '没有 OCR 文本，跳过 AI 抽取。')

    return {
      task: skipProcessingTask(db, task.id, '没有 OCR 文本，跳过 AI 抽取。'),
      createdTask: null,
    }
  }

  const result = await extractAndPersistAiSuggestions(db, {
    fileId: file.id,
    fileName: file.file_name,
    originalPath: file.original_path,
    parentFolder: file.parent_folder ?? '',
    ocrText: file.ocr_text,
    defaultPrimaryCategory: file.default_primary_category,
    defaultRegion: file.default_region,
  })

  updateFileProcessStatus(db, file.id, result.status, result.error)

  if (result.status === 'ai_extract_failed') {
    return {
      task: failProcessingTask(db, task.id, result.error ?? 'AI 抽取失败'),
      createdTask: null,
    }
  }

  if (result.status === 'ai_skipped') {
    return {
      task: skipProcessingTask(db, task.id, result.error ?? 'AI 抽取已跳过'),
      createdTask: null,
    }
  }

  return {
    task: completeProcessingTask(db, task.id, result.status),
    createdTask: null,
  }
}

function countTasksByStatus(results: ProcessingWorkerResult[], status: ProcessingTaskSummary['status']): number {
  return results.filter((result) => result.task?.status === status).length
}

function countPendingTasks(db: Database.Database, taskType?: ProcessingTaskType): number {
  const row = db.prepare(`
    SELECT count(*) AS count
    FROM processing_tasks
    WHERE status = 'pending'
      AND (@taskType IS NULL OR task_type = @taskType)
  `).get({ taskType: taskType ?? null }) as { count: number }

  return row.count
}

function getFileForTask(db: Database.Database, fileId: string): FileTaskRow | null {
  const row = db.prepare(`
    SELECT
      files.id,
      files.original_path,
      files.file_name,
      files.ext,
      files.parent_folder,
      files.ocr_text,
      files.sha256,
      files.process_status,
      files.source_batch_id,
      import_batches.default_primary_category,
      import_batches.default_region
    FROM files
    LEFT JOIN import_batches ON import_batches.id = files.source_batch_id
    WHERE files.id = ?
    LIMIT 1
  `).get(fileId) as FileTaskRow | undefined

  return row ?? null
}

function getUnprocessableFileReason(file: FileTaskRow): string | null {
  if (file.process_status === 'duplicate') {
    return '重复文件不应进入处理队列，已跳过。'
  }

  if (file.process_status === 'failed' && !file.sha256) {
    return '文件导入失败且缺少 hash，不进入 OCR / AI 处理。'
  }

  return null
}

function updateFileProcessStatus(
  db: Database.Database,
  fileId: string,
  processStatus: string,
  processError: string | null,
): void {
  db.prepare(`
    UPDATE files
    SET
      process_status = @processStatus,
      process_error = @processError,
      updated_at = @updatedAt
    WHERE id = @fileId
  `).run({
    processStatus,
    processError,
    updatedAt: new Date().toISOString(),
    fileId,
  })
}
