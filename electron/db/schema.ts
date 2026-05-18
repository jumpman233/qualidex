import type Database from 'better-sqlite3'

export function initializeSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS import_batches (
      id TEXT PRIMARY KEY,
      batch_type TEXT,
      source_path TEXT,
      default_primary_category TEXT,
      default_region TEXT,
      status TEXT,
      total_files INTEGER,
      new_files INTEGER,
      duplicate_files INTEGER,
      failed_files INTEGER,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      original_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      ext TEXT,
      size_bytes INTEGER,
      sha256 TEXT,
      mime_type TEXT,
      source_batch_id TEXT,
      source_root_path TEXT,
      parent_folder TEXT,
      ocr_text TEXT,
      ocr_status TEXT,
      process_status TEXT,
      process_error TEXT,
      archive_status TEXT DEFAULT 'pending',
      is_multi_person_file INTEGER DEFAULT 0,
      deleted_at TEXT,
      deleted_reason TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (source_batch_id) REFERENCES import_batches(id)
    );

    CREATE INDEX IF NOT EXISTS idx_files_sha256 ON files(sha256);
    CREATE INDEX IF NOT EXISTS idx_files_source_batch_id ON files(source_batch_id);
    CREATE INDEX IF NOT EXISTS idx_files_original_path ON files(original_path);
    CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at);
  `)
}
