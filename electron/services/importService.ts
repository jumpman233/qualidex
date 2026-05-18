import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { calculateFileSha256 } from './hashService'
import { type ScannedFile, scanDirectory, type ScanError } from './fileScanner'

export interface ImportedFile extends ScannedFile {
  id: string
  sha256: string | null
  importStatus: 'new' | 'duplicate' | 'failed'
  processStatus: string
  processError: string | null
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

interface ExistingHashRow {
  id: string
}

const PREVIEW_LIMIT = 200

export async function importDirectory(
  db: Database.Database,
  sourcePath: string,
): Promise<ImportDirectoryResult> {
  const startedAt = new Date().toISOString()
  const batchId = randomUUID()
  const scanResult = await scanDirectory(sourcePath, { maxPreviewFiles: Number.MAX_SAFE_INTEGER })

  const insertBatch = db.prepare(`
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
      @startedAt,
      @startedAt
    )
  `)

  insertBatch.run({
    id: batchId,
    batchType: 'source_directory',
    sourcePath: scanResult.rootPath,
    status: 'running',
    startedAt,
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
      parent_folder,
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
      @parentFolder,
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
      const processStatus = existingHash ? 'duplicate' : 'pending'

      if (existingHash) {
        duplicateFiles += 1
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
        parentFolder: path.dirname(file.relativePath),
        ocrStatus: 'pending',
        processStatus,
        processError: null,
        archiveStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })

      if (importedFiles.length < PREVIEW_LIMIT) {
        importedFiles.push({
          ...file,
          id: fileId,
          sha256,
          importStatus,
          processStatus,
          processError: null,
        })
      }
    } catch (error) {
      failedFiles += 1
      const message = getErrorMessage(error)

      errors.push({
        path: file.path,
        message,
      })

      insertFile.run({
        id: fileId,
        originalPath: file.path,
        fileName: file.name,
        ext: file.ext,
        sizeBytes: file.sizeBytes,
        sha256: null,
        sourceBatchId: batchId,
        sourceRootPath: scanResult.rootPath,
        parentFolder: path.dirname(file.relativePath),
        ocrStatus: 'pending',
        processStatus: 'failed',
        processError: message,
        archiveStatus: 'pending',
        createdAt: now,
        updatedAt: now,
      })

      if (importedFiles.length < PREVIEW_LIMIT) {
        importedFiles.push({
          ...file,
          id: fileId,
          sha256: null,
          importStatus: 'failed',
          processStatus: 'failed',
          processError: message,
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
