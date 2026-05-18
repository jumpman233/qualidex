# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.2  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 19. 数据库设计

### 19.1 people

```sql
CREATE TABLE people (
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
```

说明：

- `primary_category` 是归档主类别。
- MVP 阶段查询类别多选基于 `primary_category IN (...)`。
- 后续如支持一人多类别，再新增 `person_categories` 表。

### 19.2 person_categories，可选扩展表

MVP 可以先不实现，但 PRD 预留扩展设计：

```sql
CREATE TABLE person_categories (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT,
  confidence REAL,
  is_primary INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);
```

用途：

```text
支持一个人员同时拥有多个业务类别。
```

示例：

```text
张三_1234
- 工程，is_primary = 1
- 消防员，is_primary = 0
```

其中：

```text
is_primary = 1
```

用于归档主目录。

其他类别用于查询筛选和业务标签。

### 19.3 files

```sql
CREATE TABLE files (
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
  updated_at TEXT
);
```

### 19.4 import_batches

```sql
CREATE TABLE import_batches (
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
```

### 19.5 person_documents

```sql
CREATE TABLE person_documents (
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
  updated_at TEXT
);
```

### 19.6 licenses

```sql
CREATE TABLE licenses (
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
  updated_at TEXT
);
```

说明：

- `primary_category` 表示证书当前归属人员的主类别。
- `detected_categories` 可以存 JSON 字符串，例如 `["工程", "消防员"]`。
- MVP 可以只使用 `primary_category`。

### 19.7 review_items

```sql
CREATE TABLE review_items (
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
```

### 19.8 export_jobs

```sql
CREATE TABLE export_jobs (
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
```

### 19.9 license_match_logs

```sql
CREATE TABLE license_match_logs (
  id TEXT PRIMARY KEY,
  user_query TEXT,
  parsed_license_query TEXT,
  candidate_licenses TEXT,
  ai_grouping_result TEXT,
  user_confirmed_license_names TEXT,
  created_at TEXT
);
```

### 19.10 audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  target_type TEXT,
  target_id TEXT,
  action TEXT,
  before_value TEXT,
  after_value TEXT,
  reason TEXT,
  created_at TEXT
);
```

---
