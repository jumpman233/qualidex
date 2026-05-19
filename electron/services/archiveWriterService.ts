import type Database from 'better-sqlite3'
import { constants } from 'node:fs'
import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  generateArchivePreview,
  type ArchivePreviewItem,
} from './archivePreviewService'

export type ArchiveWriteStatus =
  | 'copied'
  | 'skipped_review'
  | 'skipped_conflict'
  | 'skipped_existing'
  | 'skipped_outside_output'
  | 'failed'

export interface ArchiveWriteItemResult {
  fileId: string
  sourcePath: string
  targetPath: string
  targetRelativePath: string
  status: ArchiveWriteStatus
  reason: string | null
}

export interface ArchiveWriteResult {
  outputRoot: string
  totalItems: number
  copiedItems: number
  skippedReviewItems: number
  skippedConflictItems: number
  skippedExistingItems: number
  failedItems: number
  results: ArchiveWriteItemResult[]
}

export async function writeArchiveFromPreview(
  db: Database.Database,
  outputRoot: string,
): Promise<ArchiveWriteResult> {
  const preview = generateArchivePreview(db, outputRoot)
  const results: ArchiveWriteItemResult[] = []

  for (const item of preview.items) {
    results.push(await writeArchiveItem(db, preview.outputRoot, item))
  }

  return {
    outputRoot: preview.outputRoot,
    totalItems: results.length,
    copiedItems: countByStatus(results, 'copied'),
    skippedReviewItems: countByStatus(results, 'skipped_review'),
    skippedConflictItems: countByStatus(results, 'skipped_conflict'),
    skippedExistingItems: countByStatus(results, 'skipped_existing'),
    failedItems: results.filter((result) => result.status === 'failed' || result.status === 'skipped_outside_output').length,
    results,
  }
}

async function writeArchiveItem(
  db: Database.Database,
  outputRoot: string,
  item: ArchivePreviewItem,
): Promise<ArchiveWriteItemResult> {
  if (item.hasConflict) {
    return toSkippedResult(item, 'skipped_conflict', item.conflictReason ?? '目标路径存在冲突')
  }

  if (item.needsReview) {
    return toSkippedResult(item, 'skipped_review', item.reviewReasons.join('；') || '资料需要确认')
  }

  if (!isPathInside(outputRoot, item.targetPath)) {
    return toSkippedResult(item, 'skipped_outside_output', '目标路径越界')
  }

  if (await pathExists(item.targetPath)) {
    return toSkippedResult(item, 'skipped_existing', '目标文件已存在，未覆盖')
  }

  try {
    await mkdir(path.dirname(item.targetPath), { recursive: true })
    await copyFile(item.sourcePath, item.targetPath, constants.COPYFILE_EXCL)
    markArchived(db, item)

    return {
      fileId: item.fileId,
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      targetRelativePath: item.targetRelativePath,
      status: 'copied',
      reason: null,
    }
  } catch (error) {
    return {
      fileId: item.fileId,
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      targetRelativePath: item.targetRelativePath,
      status: 'failed',
      reason: getErrorMessage(error),
    }
  }
}

function markArchived(db: Database.Database, item: ArchivePreviewItem): void {
  const now = new Date().toISOString()

  db.prepare(`
    UPDATE person_documents
    SET
      target_path = @targetPath,
      updated_at = @updatedAt
    WHERE file_id = @fileId
      AND (@personId IS NULL OR person_id = @personId)
      AND status = 'active'
  `).run({
    targetPath: item.targetPath,
    updatedAt: now,
    fileId: item.fileId,
    personId: item.personId,
  })

  db.prepare(`
    UPDATE files
    SET
      archive_status = 'archived',
      updated_at = @updatedAt
    WHERE id = @fileId
  `).run({
    fileId: item.fileId,
    updatedAt: now,
  })
}

function toSkippedResult(
  item: ArchivePreviewItem,
  status: Exclude<ArchiveWriteStatus, 'copied' | 'failed'>,
  reason: string,
): ArchiveWriteItemResult {
  return {
    fileId: item.fileId,
    sourcePath: item.sourcePath,
    targetPath: item.targetPath,
    targetRelativePath: item.targetRelativePath,
    status,
    reason,
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

function countByStatus(results: ArchiveWriteItemResult[], status: ArchiveWriteStatus): number {
  return results.filter((result) => result.status === status).length
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
