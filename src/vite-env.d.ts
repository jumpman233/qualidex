/// <reference types="vite/client" />

interface AppInfo {
  name: string
  version: string
  platform: string
}

interface ScannedFile {
  path: string
  relativePath: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
  isSupported: boolean
  id?: string
  sha256?: string | null
  importStatus?: 'new' | 'duplicate' | 'failed'
  processStatus?: string
  processError?: string | null
  ocrStatus?: string
  ocrTextPreview?: string
  aiStatus?: string
}

interface DirectoryScanResult {
  batchId?: string
  rootPath: string
  totalFiles: number
  supportedFiles: number
  unsupportedFiles: number
  totalBytes: number
  newFiles?: number
  duplicateFiles?: number
  failedFiles?: number
  files: ScannedFile[]
  errors: Array<{
    path: string
    message: string
  }>
  skippedDirectories: string[]
}

interface RecognitionReviewExportResult {
  outputPath: string
  rowCount: number
}

interface ImportBatchSummary {
  id: string
  batchType: string | null
  sourcePath: string | null
  defaultPrimaryCategory: string | null
  defaultRegion: string | null
  status: string | null
  totalFiles: number | null
  newFiles: number | null
  duplicateFiles: number | null
  failedFiles: number | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

type ProcessingTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
type ProcessingTaskType = 'ocr' | 'ai_extract' | 'archive'

interface ProcessingTaskSummary {
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

interface ProcessingWorkerResult {
  task: ProcessingTaskSummary | null
  createdTask: ProcessingTaskSummary | null
}

interface ProcessingBatchResult {
  maxTasks: number
  processedTasks: number
  completedTasks: number
  failedTasks: number
  skippedTasks: number
  remainingPendingTasks: number
  results: ProcessingWorkerResult[]
}

interface ArchivePreviewItem {
  personId: string | null
  personName: string | null
  fileId: string
  sourcePath: string
  targetPath: string
  targetRelativePath: string
  primaryCategory: string
  region: string
  personFolder: string
  documentFolder: string
  documentType: string | null
  isMultiPersonFile: boolean
  needsReview: boolean
  reviewReasons: string[]
  hasConflict: boolean
  conflictReason: string | null
}

interface ArchivePreviewResult {
  outputRoot: string
  totalItems: number
  conflictItems: number
  reviewItems: number
  items: ArchivePreviewItem[]
}

type ArchiveWriteStatus =
  | 'copied'
  | 'skipped_review'
  | 'skipped_conflict'
  | 'skipped_existing'
  | 'skipped_outside_output'
  | 'failed'

interface ArchiveWriteItemResult {
  fileId: string
  sourcePath: string
  targetPath: string
  targetRelativePath: string
  status: ArchiveWriteStatus
  reason: string | null
}

interface ArchiveWriteResult {
  outputRoot: string
  totalItems: number
  copiedItems: number
  skippedReviewItems: number
  skippedConflictItems: number
  skippedExistingItems: number
  failedItems: number
  results: ArchiveWriteItemResult[]
}

interface Window {
  qualidex: {
    getAppInfo(): Promise<AppInfo>
    selectSourceDirectory(): Promise<string | null>
    scanDirectory(directoryPath: string): Promise<DirectoryScanResult>
    listImportBatches(limit?: number): Promise<ImportBatchSummary[]>
    rescanDirectory(directoryPath: string): Promise<DirectoryScanResult>
    rescanImportBatch(batchId: string): Promise<DirectoryScanResult>
    listProcessingTasks(limit?: number, status?: ProcessingTaskStatus): Promise<ProcessingTaskSummary[]>
    runNextProcessingTask(taskType?: ProcessingTaskType): Promise<ProcessingWorkerResult>
    runProcessingBatch(maxTasks?: number, taskType?: ProcessingTaskType): Promise<ProcessingBatchResult>
    generateArchivePreview(outputRoot: string): Promise<ArchivePreviewResult>
    writeArchive(outputRoot: string): Promise<ArchiveWriteResult>
    exportRecognitionReviewExcel(): Promise<RecognitionReviewExportResult | null>
  }
}
