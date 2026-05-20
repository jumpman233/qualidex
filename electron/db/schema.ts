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
    CREATE INDEX IF NOT EXISTS idx_files_source_root_path ON files(source_root_path);
    CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_import_batches_source_path ON import_batches(source_path);
    CREATE INDEX IF NOT EXISTS idx_import_batches_batch_type ON import_batches(batch_type);

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT,
      id_card_last4 TEXT,
      id_card_hash TEXT,
      primary_category TEXT,
      primary_category_source TEXT,
      primary_category_confidence REAL,
      region TEXT,
      region_source TEXT,
      region_confidence REAL,
      education_level TEXT,
      education_school TEXT,
      education_major TEXT,
      review_status TEXT,
      status TEXT DEFAULT 'active',
      archive_dirty INTEGER DEFAULT 0,
      deleted_at TEXT,
      deleted_reason TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS person_documents (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      file_id TEXT,
      document_type TEXT,
      target_category TEXT,
      relation_type TEXT,
      confidence REAL,
      needs_review INTEGER,
      review_reason TEXT,
      target_path TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (person_id) REFERENCES people(id),
      FOREIGN KEY (file_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS licenses (
      id TEXT PRIMARY KEY,
      person_id TEXT,
      file_id TEXT,
      primary_category TEXT,
      detected_categories TEXT,
      region TEXT,
      raw_license_name TEXT,
      normalized_license_name TEXT,
      license_category TEXT,
      issuing_authority TEXT,
      valid_until TEXT,
      recognition_status TEXT,
      recognition_reason TEXT,
      official_status TEXT,
      official_status_source TEXT,
      official_status_updated_at TEXT,
      issuer_authority_level TEXT,
      issuer_authority_score INTEGER,
      issuer_authority_source TEXT,
      issuer_authority_reason TEXT,
      issuer_authority_review_status TEXT,
      confidence REAL,
      needs_review INTEGER,
      ocr_text TEXT,
      extracted_evidence TEXT,
      license_search_text TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (person_id) REFERENCES people(id),
      FOREIGN KEY (file_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY,
      item_type TEXT,
      ref_id TEXT,
      reason TEXT,
      status TEXT,
      suggested_value TEXT,
      confirmed_value TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_extract_results (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      provider TEXT,
      model_name TEXT,
      status TEXT,
      confidence REAL,
      needs_manual_review INTEGER,
      review_reasons TEXT,
      result_json TEXT,
      error TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS processing_tasks (
      id TEXT PRIMARY KEY,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL,
      file_id TEXT,
      batch_id TEXT,
      priority INTEGER DEFAULT 0,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      error TEXT,
      result_summary TEXT,
      queued_at TEXT,
      locked_at TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY (file_id) REFERENCES files(id),
      FOREIGN KEY (batch_id) REFERENCES import_batches(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      target_type TEXT,
      target_id TEXT,
      action TEXT,
      before_value TEXT,
      after_value TEXT,
      reason TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS export_jobs (
      id TEXT PRIMARY KEY,
      query_text TEXT,
      parsed_conditions TEXT,
      selected_people TEXT,
      output_type TEXT,
      output_path TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS license_match_logs (
      id TEXT PRIMARY KEY,
      user_query TEXT,
      parsed_license_query TEXT,
      candidate_licenses TEXT,
      ai_grouping_result TEXT,
      user_confirmed_license_names TEXT,
      created_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
    CREATE INDEX IF NOT EXISTS idx_person_documents_file_id ON person_documents(file_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_file_id ON licenses(file_id);
    CREATE INDEX IF NOT EXISTS idx_review_items_ref_id ON review_items(ref_id);
    CREATE INDEX IF NOT EXISTS idx_ai_extract_results_file_id ON ai_extract_results(file_id);
    CREATE INDEX IF NOT EXISTS idx_processing_tasks_status ON processing_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_processing_tasks_file_id ON processing_tasks(file_id);
    CREATE INDEX IF NOT EXISTS idx_processing_tasks_batch_id ON processing_tasks(batch_id);
    CREATE INDEX IF NOT EXISTS idx_processing_tasks_type_status ON processing_tasks(task_type, status);
    CREATE INDEX IF NOT EXISTS idx_export_jobs_created_at ON export_jobs(created_at);
  `)

  ensureColumn(db, 'files', 'relative_path', 'TEXT')
  ensureColumn(db, 'files', 'path_segments', 'TEXT')
  ensureColumn(db, 'files', 'path_parse_result', 'TEXT')
  ensureColumn(db, 'files', 'path_confidence', 'REAL')
  ensureColumn(db, 'licenses', 'issuer_authority_level', 'TEXT')
  ensureColumn(db, 'licenses', 'issuer_authority_score', 'INTEGER')
  ensureColumn(db, 'licenses', 'issuer_authority_source', 'TEXT')
  ensureColumn(db, 'licenses', 'issuer_authority_reason', 'TEXT')
  ensureColumn(db, 'licenses', 'issuer_authority_review_status', 'TEXT')
  ensureColumn(db, 'licenses', 'official_status', 'TEXT')
  ensureColumn(db, 'licenses', 'official_status_source', 'TEXT')
  ensureColumn(db, 'licenses', 'official_status_updated_at', 'TEXT')
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  const hasColumn = rows.some((row) => row.name === columnName)

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}
