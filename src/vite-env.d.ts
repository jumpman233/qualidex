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

interface ReviewItemSummary {
  id: string
  itemType: string | null
  refId: string | null
  reason: string | null
  status: string | null
  suggestedValue: string | null
  confirmedValue: string | null
  fileId: string | null
  fileName: string | null
  sourcePath: string | null
  parentFolder: string | null
  relativePath: string | null
  pathParseResult: string | null
  folderMergeResult: string | null
  processStatus: string | null
  ocrStatus: string | null
  ocrText: string | null
  ocrTextPreview: string | null
  aiStatus: string | null
  aiResultJson: string | null
  aiSummary: string | null
  personId: string | null
  personName: string | null
  idCardNumber: string | null
  primaryCategory: string | null
  region: string | null
  documentType: string | null
  licenseName: string | null
  licenseRecognitionStatus: string | null
  licenseNeedsReview: boolean
  createdAt: string | null
  updatedAt: string | null
}

interface ReviewItemActionResult {
  reviewItem: ReviewItemSummary
  auditLogId: string
}

interface SourceOpenResult {
  opened: boolean
  targetPath: string | null
  error: string | null
}

interface ReviewFieldPatch {
  primaryCategory?: string | null
  region?: string | null
  documentType?: string | null
  licenseName?: string | null
  licenseRecognitionStatus?: string | null
}

interface PersonCandidateSummary {
  id: string
  name: string | null
  idCardNumber: string | null
  idCardLast4: string | null
  maskedDisplay: string | null
  primaryCategory: string | null
  region: string | null
  reviewStatus: string | null
  documentCount: number
}

interface CreatePersonFromReviewInput {
  name: string
  idCardNumber?: string | null
  idCardLast4?: string | null
  primaryCategory?: string | null
  region?: string | null
}

interface MergePeopleInput {
  targetPersonId: string
  sourcePersonIds: string[]
  reason?: string | null
}

interface MergePeopleResult {
  targetPerson: PersonCandidateSummary
  mergedSourcePersonIds: string[]
  movedDocumentCount: number
  movedLicenseCount: number
  auditLogId: string
}

interface QueryPeopleConditions {
  categories?: string[]
  region?: string | null
  educationMin?: string | null
  licenseQuery?: string | null
  includePendingReview?: boolean
  limit?: number
}

interface QueryPersonResult {
  personId: string
  name: string | null
  idCardNumber: string | null
  idCardLast4: string | null
  maskedDisplay: string | null
  primaryCategory: string | null
  region: string | null
  educationLevel: string | null
  licenseNames: string[]
  documentCount: number
  matchReason: string
}

interface QueryResultsExcelExportResult {
  exportJobId: string
  outputPath: string
  rowCount: number
}

interface QueryResultsExcelExportOptions {
  exportFullIdCard?: boolean
}

interface QueryFilesExportResult {
  exportJobId: string
  outputRoot: string
  selectedPeople: string[]
  totalItems: number
  copiedItems: number
  skippedExistingItems: number
  failedItems: number
}

interface DeletedItemSummary {
  id: string
  itemType: 'person' | 'file'
  name: string | null
  deletedAt: string | null
  deletedReason: string | null
}

interface RecycleActionResult {
  auditLogId: string
}

interface ArchiveOutputCleanupResult {
  outputRoot: string
  removedEntries: number
  failedEntries: number
  auditLogId: string
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
    listReviewItems(limit?: number): Promise<ReviewItemSummary[]>
    openReviewSourceFile(reviewItemId: string): Promise<SourceOpenResult>
    openReviewSourceFolder(reviewItemId: string): Promise<SourceOpenResult>
    confirmReviewItem(reviewItemId: string, confirmedValue?: string | null): Promise<ReviewItemActionResult>
    ignoreReviewItem(reviewItemId: string, reason?: string | null): Promise<ReviewItemActionResult>
    updateReviewFields(reviewItemId: string, patch: ReviewFieldPatch): Promise<ReviewItemActionResult>
    listPersonCandidates(query?: string, limit?: number): Promise<PersonCandidateSummary[]>
    reassignReviewPerson(reviewItemId: string, personId: string): Promise<ReviewItemActionResult>
    createPersonFromReview(reviewItemId: string, input: CreatePersonFromReviewInput): Promise<ReviewItemActionResult>
    mergePeople(input: MergePeopleInput): Promise<MergePeopleResult>
    queryPeople(conditions: QueryPeopleConditions): Promise<QueryPersonResult[]>
    exportQueryResultsExcel(conditions: QueryPeopleConditions, options?: QueryResultsExcelExportOptions): Promise<QueryResultsExcelExportResult | null>
    exportQueryResultFiles(conditions: QueryPeopleConditions): Promise<QueryFilesExportResult | null>
    listDeletedItems(limit?: number): Promise<DeletedItemSummary[]>
    softDeletePerson(personId: string, reason?: string): Promise<RecycleActionResult>
    restorePerson(personId: string): Promise<RecycleActionResult>
    softDeleteFile(fileId: string, reason?: string): Promise<RecycleActionResult>
    restoreFile(fileId: string): Promise<RecycleActionResult>
    cleanupArchiveOutput(outputRoot: string): Promise<ArchiveOutputCleanupResult>
    exportRecognitionReviewExcel(): Promise<RecognitionReviewExportResult | null>
  }
}
