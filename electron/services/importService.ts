import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { type ScannedFile, scanDirectory, type ScanError } from './fileScanner'
import { calculateFileSha256 } from './hashService'
import { parsePathSemantics, splitPathSegments } from './pathSemanticService'
import { createProcessingTask } from './processingQueueService'

export interface ImportedFile extends ScannedFile {
  id: string
  sha256: string | null
  importStatus: 'new' | 'duplicate' | 'failed'
  processStatus: string
  processError: string | null
  ocrStatus: string
  ocrTextPreview: string
  aiStatus: string
}

export interface ImportDirectoryResult {
  batchId: string
  rootPath: string
  totalFiles: number
  supportedFiles: number
  unsupportedFiles: number
  totalBytes: number
  newFiles: number
  duplicateFiles: number
  failedFiles: number
  files: ImportedFile[]
  errors: ScanError[]
  skippedDirectories: string[]
}

export interface ImportBatchSummary {
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

export type ImportBatchType = 'full_import' | 'add_folder' | 'rescan'
export type RescanMode = 'metadata_only' | 'failed_only' | 'all_files'

export interface ImportDirectoryOptions {
  batchType?: ImportBatchType
  defaultPrimaryCategory?: string | null
  defaultRegion?: string | null
  rescanMode?: RescanMode
}

interface ExistingHashRow {
  id: string
}

interface ImportBatchRow {
  id: string
  batch_type: string | null
  source_path: string | null
  default_primary_category: string | null
  default_region: string | null
  status: string | null
  total_files: number | null
  new_files: number | null
  duplicate_files: number | null
  failed_files: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string | null
  updated_at: string | null
}

const PREVIEW_LIMIT = 200

export function listImportBatches(db: Database.Database, limit = 50): ImportBatchSummary[] {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 200)
  const rows = db.prepare(`
    SELECT
      id,
      batch_type,
      source_path,
      default_primary_category,
      default_region,
      status,
      total_files,
      new_files,
      duplicate_files,
      failed_files,
      started_at,
      finished_at,
      created_at,
      updated_at
    FROM import_batches
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `).all(safeLimit) as ImportBatchRow[]

  return rows.map(toImportBatchSummary)
}

export async function rescanDirectory(
  db: Database.Database,
  sourcePath: string,
  options: Omit<ImportDirectoryOptions, 'batchType'> = {},
): Promise<ImportDirectoryResult> {
  return importDirectory(db, sourcePath, {
    ...options,
    batchType: 'rescan',
  })
}

export async function rescanImportBatch(
  db: Database.Database,
  batchId: string,
  options: Omit<ImportDirectoryOptions, 'batchType'> = {},
): Promise<ImportDirectoryResult> {
  const batch = db.prepare(`
    SELECT
      source_path,
      default_primary_category,
      default_region
    FROM import_batches
    WHERE id = ?
    LIMIT 1
  `).get(batchId) as Pick<
    ImportBatchRow,
    'source_path' | 'default_primary_category' | 'default_region'
  > | undefined

  if (!batch?.source_path) {
    throw new Error(`Import batch not found or has no source path: ${batchId}`)
  }

  return rescanDirectory(db, batch.source_path, {
    ...options,
    defaultPrimaryCategory: options.defaultPrimaryCategory ?? batch.default_primary_category,
    defaultRegion: options.defaultRegion ?? batch.default_region,
  })
}

export async function importDirectory(
  db: Database.Database,
  sourcePath: string,
  options: ImportDirectoryOptions = {},
): Promise<ImportDirectoryResult> {
  const startedAt = new Date().toISOString()
  const batchId = randomUUID()
  const batchType = options.batchType ?? 'full_import'
  const scanResult = await scanDirectory(sourcePath, { maxPreviewFiles: Number.MAX_SAFE_INTEGER })

  db.prepare(`
    INSERT INTO import_batches (
      id,
      batch_type,
      source_path,
      status,
      total_files,
      new_files,
      duplicate_files,
      failed_files,
      started_at,
      default_primary_category,
      default_region,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @batchType,
      @sourcePath,
      @status,
      0,
      0,
      0,
      0,
      @startedAt,
      @defaultPrimaryCategory,
      @defaultRegion,
      @startedAt,
      @startedAt
    )
  `).run({
    id: batchId,
    batchType,
    sourcePath: scanResult.rootPath,
    status: 'running',
    startedAt,
    defaultPrimaryCategory: options.defaultPrimaryCategory ?? null,
    defaultRegion: options.defaultRegion ?? null,
  })

  const insertFile = db.prepare(`
    INSERT INTO files (
      id,
      original_path,
      file_name,
      ext,
      size_bytes,
      sha256,
      source_batch_id,
      source_root_path,
      relative_path,
      parent_folder,
      folder_merge_key,
      folder_merge_result,
      folder_merge_confidence,
      path_segments,
      path_parse_result,
      path_confidence,
      ocr_text,
      ocr_status,
      process_status,
      process_error,
      archive_status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @originalPath,
      @fileName,
      @ext,
      @sizeBytes,
      @sha256,
      @sourceBatchId,
      @sourceRootPath,
      @relativePath,
      @parentFolder,
      @folderMergeKey,
      NULL,
      NULL,
      @pathSegments,
      @pathParseResult,
      @pathConfidence,
      @ocrText,
      @ocrStatus,
      @processStatus,
      @processError,
      @archiveStatus,
      @createdAt,
      @updatedAt
    )
  `)

  const findExistingHash = db.prepare(`
    SELECT id
    FROM files
    WHERE sha256 = ?
      AND deleted_at IS NULL
    LIMIT 1
  `)

  const importedFiles: ImportedFile[] = []
  const errors = [...scanResult.errors]
  let newFiles = 0
  let duplicateFiles = 0
  let failedFiles = scanResult.errors.length

  for (const file of scanResult.files) {
    const fileId = randomUUID()
    const now = new Date().toISOString()

    try {
      const sha256 = await calculateFileSha256(file.path)
      const existingHash = findExistingHash.get(sha256) as ExistingHashRow | undefined
      const importStatus = existingHash ? 'duplicate' : 'new'
      const parentFolder = path.dirname(file.relativePath)
      const folderMergeKey = buildFolderMergeKey(batchId, scanResult.rootPath, parentFolder)
      const pathSemantic = parsePathSemantics({
        sourceRootPath: scanResult.rootPath,
        relativePath: file.relativePath,
        fileName: file.name,
        parentFolder,
        defaultPrimaryCategory: options.defaultPrimaryCategory,
        defaultRegion: options.defaultRegion,
      })

      if (existingHash) {
        duplicateFiles += 1
        if (importedFiles.length < PREVIEW_LIMIT) {
          importedFiles.push({
            ...file,
            id: `duplicate:${sha256}`,
            sha256,
            importStatus,
            processStatus: 'skipped',
            processError: `重复文件，已存在记录 ${existingHash.id}，本次不入库、不创建处理任务。`,
            ocrStatus: 'skipped',
            ocrTextPreview: '',
            aiStatus: 'skipped',
          })
        }

        continue
      } else {
        newFiles += 1
      }

      insertFile.run({
        id: fileId,
        originalPath: file.path,
        fileName: file.name,
        ext: file.ext,
        sizeBytes: file.sizeBytes,
        sha256,
        sourceBatchId: batchId,
        sourceRootPath: scanResult.rootPath,
        relativePath: file.relativePath,
        parentFolder,
        folderMergeKey,
        pathSegments: JSON.stringify(splitPathSegments(file.relativePath)),
        pathParseResult: JSON.stringify(pathSemantic),
        pathConfidence: pathSemantic.confidence,
        ocrText: null,
        ocrStatus: 'pending',
        processStatus: 'pending_ocr',
        processError: null,
        archiveStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })

      createProcessingTask(db, {
        taskType: 'ocr',
        fileId,
        batchId,
        status: 'pending',
      })

      if (importedFiles.length < PREVIEW_LIMIT) {
        importedFiles.push({
          ...file,
          id: fileId,
          sha256,
          importStatus,
          processStatus: 'pending_ocr',
          processError: null,
          ocrStatus: 'pending',
          ocrTextPreview: '',
          aiStatus: 'pending',
        })
      }
    } catch (error) {
      failedFiles += 1
      const message = getErrorMessage(error)

      errors.push({
        path: file.path,
        message,
      })

      if (importedFiles.length < PREVIEW_LIMIT) {
        importedFiles.push({
          ...file,
          id: fileId,
          sha256: null,
          importStatus: 'failed',
          processStatus: 'failed',
          processError: message,
          ocrStatus: 'failed',
          ocrTextPreview: '',
          aiStatus: 'ai_skipped',
        })
      }
    }
  }

  const finishedAt = new Date().toISOString()

  db.prepare(`
    UPDATE import_batches
    SET
      status = @status,
      total_files = @totalFiles,
      new_files = @newFiles,
      duplicate_files = @duplicateFiles,
      failed_files = @failedFiles,
      finished_at = @finishedAt,
      updated_at = @finishedAt
    WHERE id = @batchId
  `).run({
    status: failedFiles > 0 ? 'completed_with_errors' : 'completed',
    totalFiles: scanResult.totalFiles,
    newFiles,
    duplicateFiles,
    failedFiles,
    finishedAt,
    batchId,
  })

  return {
    batchId,
    rootPath: scanResult.rootPath,
    totalFiles: scanResult.totalFiles,
    supportedFiles: scanResult.supportedFiles,
    unsupportedFiles: scanResult.unsupportedFiles,
    totalBytes: scanResult.totalBytes,
    newFiles,
    duplicateFiles,
    failedFiles,
    files: importedFiles,
    errors,
    skippedDirectories: scanResult.skippedDirectories,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

function buildFolderMergeKey(batchId: string, sourceRootPath: string, parentFolder: string): string {
  return JSON.stringify({
    batchId,
    sourceRootPath,
    parentFolder,
  })
}

function toImportBatchSummary(row: ImportBatchRow): ImportBatchSummary {
  return {
    id: row.id,
    batchType: row.batch_type,
    sourcePath: row.source_path,
    defaultPrimaryCategory: row.default_primary_category,
    defaultRegion: row.default_region,
    status: row.status,
    totalFiles: row.total_files,
    newFiles: row.new_files,
    duplicateFiles: row.duplicate_files,
    failedFiles: row.failed_files,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
