import { existsSync, copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const includeOcrFailed = args.includes('--include-ocr-failed')
const dbPath = readOption('--db') ?? getDefaultDatabasePath()

let DatabaseSync

try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  throw new Error(
    '当前 Node 不支持 node:sqlite。请切换到 Node 22+ 后再运行，例如 nvm use 22；应用里的 better-sqlite3 不需要因此重编译。',
  )
}

if (!existsSync(dbPath)) {
  throw new Error(`Database not found: ${dbPath}`)
}

if (apply) {
  backupDatabaseFiles(dbPath)
}

const db = new DatabaseSync(dbPath)

try {
  const result = cleanup(db, apply, includeOcrFailed)
  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        database: dbPath,
        includeOcrFailed,
        ...result,
      },
      null,
      2,
    ),
  )
} finally {
  db.close()
}

function readOption(name) {
  const index = args.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function getDefaultDatabasePath() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'qualidex', 'data', 'qualidex.sqlite')
  }

  const home = process.env.HOME
  if (!home) {
    throw new Error('Cannot resolve default database path. Use --db <path> instead.')
  }

  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'qualidex', 'data', 'qualidex.sqlite')
  }

  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), 'qualidex', 'data', 'qualidex.sqlite')
}

function backupDatabaseFiles(databasePath) {
  const backupDir = path.join(path.dirname(databasePath), 'backups')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  mkdirSync(backupDir, { recursive: true })

  for (const suffix of ['', '-wal', '-shm']) {
    const source = databasePath + suffix
    if (existsSync(source)) {
      const target = path.join(backupDir, `${path.basename(source)}.${stamp}.bak`)
      copyFileSync(source, target)
    }
  }
}

function cleanup(database, shouldApply, shouldIncludeOcrFailed) {
  database.exec('PRAGMA foreign_keys = ON')

  const predicate = shouldIncludeOcrFailed
    ? "(process_status = 'duplicate' OR process_status = 'failed')"
    : "(process_status = 'duplicate' OR (process_status = 'failed' AND sha256 IS NULL))"

  const rows = database
    .prepare(`
      SELECT id, file_name, original_path, process_status, ocr_status, sha256, source_batch_id
      FROM files
      WHERE ${predicate}
      ORDER BY created_at ASC, rowid ASC
    `)
    .all()

  database.exec('DROP TABLE IF EXISTS temp.cleanup_import_pollution_ids')
  database.exec('CREATE TEMP TABLE cleanup_import_pollution_ids (id TEXT PRIMARY KEY)')

  const insertId = database.prepare('INSERT INTO cleanup_import_pollution_ids (id) VALUES (?)')
  database.exec('BEGIN')
  try {
    for (const row of rows) {
      insertId.run(row.id)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  const counts = {
    files: rows.length,
    processingTasks: countByFileId(database, 'processing_tasks'),
    aiExtractResults: countByFileId(database, 'ai_extract_results'),
    personDocuments: countByFileId(database, 'person_documents'),
    licenses: countByFileId(database, 'licenses'),
    reviewItems: countReviewItems(database),
  }

  if (!shouldApply) {
    return {
      deleted: false,
      counts,
      sampleFiles: rows.slice(0, 20),
    }
  }

  database.exec('BEGIN IMMEDIATE')
  try {
    database
      .prepare(`
        DELETE FROM processing_tasks
        WHERE file_id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database
      .prepare(`
        DELETE FROM ai_extract_results
        WHERE file_id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database
      .prepare(`
        DELETE FROM review_items
        WHERE ref_id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database
      .prepare(`
        DELETE FROM licenses
        WHERE file_id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database
      .prepare(`
        DELETE FROM person_documents
        WHERE file_id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database
      .prepare(`
        DELETE FROM files
        WHERE id IN (SELECT id FROM cleanup_import_pollution_ids)
      `)
      .run()
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  return {
    deleted: true,
    counts,
    sampleFiles: rows.slice(0, 20),
  }
}

function countByFileId(database, tableName) {
  return database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ${tableName}
      WHERE file_id IN (SELECT id FROM cleanup_import_pollution_ids)
    `)
    .get().count
}

function countReviewItems(database) {
  return database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM review_items
      WHERE ref_id IN (SELECT id FROM cleanup_import_pollution_ids)
    `)
    .get().count
}

