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

    CREATE INDEX IF NOT EXISTS idx_people_name ON people(name);
    CREATE INDEX IF NOT EXISTS idx_person_documents_file_id ON person_documents(file_id);
    CREATE INDEX IF NOT EXISTS idx_licenses_file_id ON licenses(file_id);
    CREATE INDEX IF NOT EXISTS idx_review_items_ref_id ON review_items(ref_id);
    CREATE INDEX IF NOT EXISTS idx_ai_extract_results_file_id ON ai_extract_results(file_id);
  `)
}
