import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'

export type ProcessingTaskType = 'ocr' | 'ai_extract' | 'archive'
export type ProcessingTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface CreateProcessingTaskInput {
  taskType: ProcessingTaskType
  fileId?: string | null
  batchId?: string | null
  priority?: number
  maxAttempts?: number
  status?: ProcessingTaskStatus
  error?: string | null
  resultSummary?: string | null
}

export interface ProcessingTaskSummary {
  id: string
  taskType: ProcessingTaskType
  status: ProcessingTaskStatus
  fileId: string | null
  batchId: string | null
  priority: number
  attempts: number
  maxAttempts: number
  error: string | null
  resultSummary: string | null
  queuedAt: string | null
  lockedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

interface ProcessingTaskRow {
  id: string
  task_type: ProcessingTaskType
  status: ProcessingTaskStatus
  file_id: string | null
  batch_id: string | null
  priority: number
  attempts: number
  max_attempts: number
  error: string | null
  result_summary: string | null
  queued_at: string | null
  locked_at: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string | null
  updated_at: string | null
}

export function createProcessingTask(
  db: Database.Database,
  input: CreateProcessingTaskInput,
): ProcessingTaskSummary {
  const now = new Date().toISOString()
  const status = input.status ?? 'pending'
  const task: ProcessingTaskRow = {
    id: randomUUID(),
    task_type: input.taskType,
    status,
    file_id: input.fileId ?? null,
    batch_id: input.batchId ?? null,
    priority: input.priority ?? 0,
    attempts: status === 'running' ? 1 : 0,
    max_attempts: input.maxAttempts ?? 3,
    error: input.error ?? null,
    result_summary: input.resultSummary ?? null,
    queued_at: now,
    locked_at: status === 'running' ? now : null,
    started_at: status === 'running' ? now : null,
    finished_at: status === 'completed' || status === 'failed' || status === 'skipped' ? now : null,
    created_at: now,
    updated_at: now,
  }

  db.prepare(`
    INSERT INTO processing_tasks (
      id,
      task_type,
      status,
      file_id,
      batch_id,
      priority,
      attempts,
      max_attempts,
      error,
      result_summary,
      queued_at,
      locked_at,
      started_at,
      finished_at,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @task_type,
      @status,
      @file_id,
      @batch_id,
      @priority,
      @attempts,
      @max_attempts,
      @error,
      @result_summary,
      @queued_at,
      @locked_at,
      @started_at,
      @finished_at,
      @created_at,
      @updated_at
    )
  `).run(task)

  return toProcessingTaskSummary(task)
}

export function startProcessingTask(
  db: Database.Database,
  taskId: string,
): ProcessingTaskSummary {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE processing_tasks
    SET
      status = 'running',
      attempts = attempts + 1,
      locked_at = @now,
      started_at = COALESCE(started_at, @now),
      updated_at = @now
    WHERE id = @taskId
  `).run({ taskId, now })

  return getProcessingTask(db, taskId)
}

export function completeProcessingTask(
  db: Database.Database,
  taskId: string,
  resultSummary?: string | null,
): ProcessingTaskSummary {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE processing_tasks
    SET
      status = 'completed',
      error = NULL,
      result_summary = @resultSummary,
      finished_at = @now,
      updated_at = @now
    WHERE id = @taskId
  `).run({ taskId, resultSummary: resultSummary ?? null, now })

  return getProcessingTask(db, taskId)
}

export function failProcessingTask(
  db: Database.Database,
  taskId: string,
  error: string,
): ProcessingTaskSummary {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE processing_tasks
    SET
      status = 'failed',
      error = @error,
      finished_at = @now,
      updated_at = @now
    WHERE id = @taskId
  `).run({ taskId, error, now })

  return getProcessingTask(db, taskId)
}

export function skipProcessingTask(
  db: Database.Database,
  taskId: string,
  reason: string,
): ProcessingTaskSummary {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE processing_tasks
    SET
      status = 'skipped',
      error = @reason,
      finished_at = @now,
      updated_at = @now
    WHERE id = @taskId
  `).run({ taskId, reason, now })

  return getProcessingTask(db, taskId)
}

export function claimNextProcessingTask(
  db: Database.Database,
  taskType?: ProcessingTaskType,
): ProcessingTaskSummary | null {
  const row = db.prepare(`
    SELECT *
    FROM processing_tasks
    WHERE status = 'pending'
      AND (@taskType IS NULL OR task_type = @taskType)
    ORDER BY priority DESC, queued_at ASC, rowid ASC
    LIMIT 1
  `).get({ taskType: taskType ?? null }) as ProcessingTaskRow | undefined

  if (!row) {
    return null
  }

  return startProcessingTask(db, row.id)
}

export function listProcessingTasks(
  db: Database.Database,
  limit = 50,
  status?: ProcessingTaskStatus,
): ProcessingTaskSummary[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const rows = db.prepare(`
    SELECT *
    FROM processing_tasks
    WHERE @status IS NULL OR status = @status
    ORDER BY created_at DESC, rowid DESC
    LIMIT @limit
  `).all({ limit: safeLimit, status: status ?? null }) as ProcessingTaskRow[]

  return rows.map(toProcessingTaskSummary)
}

function getProcessingTask(db: Database.Database, taskId: string): ProcessingTaskSummary {
  const row = db.prepare(`
    SELECT *
    FROM processing_tasks
    WHERE id = ?
    LIMIT 1
  `).get(taskId) as ProcessingTaskRow | undefined

  if (!row) {
    throw new Error(`Processing task not found: ${taskId}`)
  }

  return toProcessingTaskSummary(row)
}

function toProcessingTaskSummary(row: ProcessingTaskRow): ProcessingTaskSummary {
  return {
    id: row.id,
    taskType: row.task_type,
    status: row.status,
    fileId: row.file_id,
    batchId: row.batch_id,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    error: row.error,
    resultSummary: row.result_summary,
    queuedAt: row.queued_at,
    lockedAt: row.locked_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
