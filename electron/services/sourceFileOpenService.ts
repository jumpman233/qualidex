import type Database from 'better-sqlite3'
import { shell } from 'electron'
import path from 'node:path'

export interface SourceOpenResult {
  opened: boolean
  targetPath: string | null
  error: string | null
}

interface SourcePathRow {
  original_path: string | null
}

export async function openReviewItemSourceFile(
  db: Database.Database,
  reviewItemId: string,
): Promise<SourceOpenResult> {
  const sourcePath = readReviewItemSourcePath(db, reviewItemId)
  if (!sourcePath) {
    return {
      opened: false,
      targetPath: null,
      error: '待确认项没有关联原始文件。',
    }
  }

  const error = await shell.openPath(sourcePath)
  return {
    opened: !error,
    targetPath: sourcePath,
    error: error || null,
  }
}

export async function openReviewItemSourceFolder(
  db: Database.Database,
  reviewItemId: string,
): Promise<SourceOpenResult> {
  const sourcePath = readReviewItemSourcePath(db, reviewItemId)
  if (!sourcePath) {
    return {
      opened: false,
      targetPath: null,
      error: '待确认项没有关联原始文件夹。',
    }
  }

  const folderPath = path.dirname(sourcePath)
  const error = await shell.openPath(folderPath)
  return {
    opened: !error,
    targetPath: folderPath,
    error: error || null,
  }
}

function readReviewItemSourcePath(
  db: Database.Database,
  reviewItemId: string,
): string | null {
  const row = db.prepare(`
    SELECT files.original_path
    FROM review_items
    LEFT JOIN files ON files.id = review_items.ref_id
    WHERE review_items.id = @reviewItemId
    LIMIT 1
  `).get({ reviewItemId }) as SourcePathRow | undefined

  return row?.original_path ?? null
}
