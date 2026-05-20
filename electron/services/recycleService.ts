import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

export interface DeletedItemSummary {
  id: string
  itemType: 'person' | 'file'
  name: string | null
  deletedAt: string | null
  deletedReason: string | null
}

export interface RecycleActionResult {
  auditLogId: string
}

export interface ArchiveOutputCleanupResult {
  outputRoot: string
  removedEntries: number
  failedEntries: number
  auditLogId: string
}

interface DeletedItemRow {
  id: string
  item_type: 'person' | 'file'
  name: string | null
  deleted_at: string | null
  deleted_reason: string | null
}

export function listDeletedItems(db: Database.Database, limit = 100): DeletedItemSummary[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 500) : 100
  const rows = db.prepare(`
    SELECT id, 'person' AS item_type, name, deleted_at, deleted_reason
    FROM people
    WHERE deleted_at IS NOT NULL
       OR status IN ('deleted', 'merged')
    UNION ALL
    SELECT id, 'file' AS item_type, file_name AS name, deleted_at, deleted_reason
    FROM files
    WHERE deleted_at IS NOT NULL
       OR archive_status = 'deleted'
    ORDER BY deleted_at DESC
    LIMIT @limit
  `).all({ limit: safeLimit }) as DeletedItemRow[]

  return rows.map((row) => ({
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    deletedAt: row.deleted_at,
    deletedReason: row.deleted_reason,
  }))
}

export function softDeletePerson(
  db: Database.Database,
  personId: string,
  reason = '人工删除',
): RecycleActionResult {
  const existing = db.prepare('SELECT * FROM people WHERE id = @personId LIMIT 1').get({ personId }) as Record<string, unknown> | undefined
  if (!existing) {
    throw new Error('人员不存在。')
  }

  const now = new Date().toISOString()
  const auditLogId = randomUUID()
  db.transaction(() => {
    db.prepare(`
      UPDATE people
      SET
        status = 'deleted',
        archive_dirty = 1,
        deleted_at = @deletedAt,
        deleted_reason = @deletedReason,
        updated_at = @updatedAt
      WHERE id = @personId
    `).run({ personId, deletedAt: now, deletedReason: reason, updatedAt: now })
    insertAuditLog(db, auditLogId, 'person', personId, '软删除人员', existing, { ...existing, status: 'deleted' }, reason, now)
  })()

  return { auditLogId }
}

export function restorePerson(db: Database.Database, personId: string): RecycleActionResult {
  const existing = db.prepare('SELECT * FROM people WHERE id = @personId LIMIT 1').get({ personId }) as Record<string, unknown> | undefined
  if (!existing) {
    throw new Error('人员不存在。')
  }

  const now = new Date().toISOString()
  const auditLogId = randomUUID()
  db.transaction(() => {
    db.prepare(`
      UPDATE people
      SET
        status = 'active',
        archive_dirty = 1,
        deleted_at = NULL,
        deleted_reason = NULL,
        updated_at = @updatedAt
      WHERE id = @personId
    `).run({ personId, updatedAt: now })
    insertAuditLog(db, auditLogId, 'person', personId, '恢复人员', existing, { ...existing, status: 'active' }, null, now)
  })()

  return { auditLogId }
}

export function softDeleteFile(
  db: Database.Database,
  fileId: string,
  reason = '人工删除',
): RecycleActionResult {
  const existing = db.prepare('SELECT * FROM files WHERE id = @fileId LIMIT 1').get({ fileId }) as Record<string, unknown> | undefined
  if (!existing) {
    throw new Error('文件不存在。')
  }

  const now = new Date().toISOString()
  const auditLogId = randomUUID()
  db.transaction(() => {
    db.prepare(`
      UPDATE files
      SET
        archive_status = 'deleted',
        deleted_at = @deletedAt,
        deleted_reason = @deletedReason,
        updated_at = @updatedAt
      WHERE id = @fileId
    `).run({ fileId, deletedAt: now, deletedReason: reason, updatedAt: now })
    markFilePeopleDirty(db, fileId, now)
    insertAuditLog(db, auditLogId, 'file', fileId, '软删除文件', existing, { ...existing, archive_status: 'deleted' }, reason, now)
  })()

  return { auditLogId }
}

export function restoreFile(db: Database.Database, fileId: string): RecycleActionResult {
  const existing = db.prepare('SELECT * FROM files WHERE id = @fileId LIMIT 1').get({ fileId }) as Record<string, unknown> | undefined
  if (!existing) {
    throw new Error('文件不存在。')
  }

  const now = new Date().toISOString()
  const auditLogId = randomUUID()
  db.transaction(() => {
    db.prepare(`
      UPDATE files
      SET
        archive_status = 'pending',
        deleted_at = NULL,
        deleted_reason = NULL,
        updated_at = @updatedAt
      WHERE id = @fileId
    `).run({ fileId, updatedAt: now })
    markFilePeopleDirty(db, fileId, now)
    insertAuditLog(db, auditLogId, 'file', fileId, '恢复文件', existing, { ...existing, archive_status: 'pending' }, null, now)
  })()

  return { auditLogId }
}

export async function cleanupArchiveOutput(
  db: Database.Database,
  outputRoot: string,
): Promise<ArchiveOutputCleanupResult> {
  const resolvedOutputRoot = path.resolve(outputRoot)
  if (path.parse(resolvedOutputRoot).root === resolvedOutputRoot) {
    throw new Error('不能清理磁盘根目录。')
  }

  const entries = await readdir(resolvedOutputRoot, { withFileTypes: true })
  let removedEntries = 0
  let failedEntries = 0
  for (const entry of entries) {
    const targetPath = path.join(resolvedOutputRoot, entry.name)
    if (!isPathInside(resolvedOutputRoot, targetPath)) {
      failedEntries += 1
      continue
    }
    try {
      await rm(targetPath, { recursive: true, force: true })
      removedEntries += 1
    } catch {
      failedEntries += 1
    }
  }

  const auditLogId = randomUUID()
  insertAuditLog(
    db,
    auditLogId,
    'archive_output',
    resolvedOutputRoot,
    '清理归档输出副本',
    { outputRoot: resolvedOutputRoot },
    { removedEntries, failedEntries },
    '仅清理归档输出目录副本，不触碰原始资料',
    new Date().toISOString(),
  )

  return {
    outputRoot: resolvedOutputRoot,
    removedEntries,
    failedEntries,
    auditLogId,
  }
}

function markFilePeopleDirty(db: Database.Database, fileId: string, now: string): void {
  db.prepare(`
    UPDATE people
    SET
      archive_dirty = 1,
      updated_at = @updatedAt
    WHERE id IN (
      SELECT person_id
      FROM person_documents
      WHERE file_id = @fileId
        AND person_id IS NOT NULL
        AND status = 'active'
    )
  `).run({ fileId, updatedAt: now })
}

function insertAuditLog(
  db: Database.Database,
  id: string,
  targetType: string,
  targetId: string,
  action: string,
  beforeValue: unknown,
  afterValue: unknown,
  reason: string | null,
  createdAt: string,
): void {
  db.prepare(`
    INSERT INTO audit_logs (
      id,
      target_type,
      target_id,
      action,
      before_value,
      after_value,
      reason,
      created_at
    )
    VALUES (
      @id,
      @targetType,
      @targetId,
      @action,
      @beforeValue,
      @afterValue,
      @reason,
      @createdAt
    )
  `).run({
    id,
    targetType,
    targetId,
    action,
    beforeValue: JSON.stringify(beforeValue),
    afterValue: JSON.stringify(afterValue),
    reason,
    createdAt,
  })
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}
