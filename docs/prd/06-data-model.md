# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.4  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 20. 数据库设计

### 19.1 people

```sql
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT,
  id_card_number TEXT,
  id_card_number_encrypted TEXT,
  id_card_last4 TEXT,
  id_card_hash TEXT,
  masked_display TEXT,

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
- [P0] `id_card_number` 保存完整身份证号明文，仅限本地 SQLite。
- [P1] `id_card_number_encrypted` 预留给后续加密存储。
- [P0] `id_card_hash` 用于快速查重、归并和冲突判断。
- [P0] `masked_display` 用于页面默认脱敏展示，例如 `1234****5678`。
- [P0] 不允许一个人员关联多个不同完整身份证号；冲突时进入待确认。

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
  relative_path TEXT,
  parent_folder TEXT,
  path_segments TEXT,
  path_parse_result TEXT,
  path_confidence REAL,

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

#### 路径字段说明

`relative_path` 是文件相对 `source_root_path` 的路径。

`path_segments` 建议存 JSON 字符串，例如：

```json
["工程", "成都", "张三", "二建证.pdf"]
```

`path_parse_result` 建议存 JSON 字符串，例如：

```json
{
  "candidate_primary_category": "工程",
  "candidate_region": "成都",
  "candidate_person_name": "张三",
  "candidate_document_type": "license",
  "candidate_license_hint": "二建证",
  "evidence": ["路径层级包含工程", "父级目录为张三"]
}
```

`path_confidence` 表示路径语义解析置信度。

路径解析结果只作为候选信息，不作为最终人工确认结果。

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

说明：

- [P0] `relation_type` 可表达 `owner`、`related`、`multi_person_related` 等关系。
- [P0] 多人员文件应通过多条 `person_documents` 关联到所有涉及人员。
- [P0] 多人员文件归档时仍只复制到 `_多人员资料`，不自动复制到每个人目录。

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
  updated_at TEXT
);
```

说明：

- `primary_category` 表示证书当前归属人员的主类别。
- `detected_categories` 可以存 JSON 字符串，例如 `["工程", "消防员"]`。
- MVP 可以只使用 `primary_category`。
- [P0] 一个人可以关联多条 `licenses` 记录。
- [P0] 每条证书独立保存证书名称、状态、有效期、官方 / 非官方标签和颁发机构信息。
- [P0] 查询和导出不得假设一个人员只有一张证书。
- [P1] 证书归属不确定时，应通过待确认项调整 `person_id`。

#### 证书官方 / 非官方人工标签

每个人员证书需要预留一个人工维护标签，用于标记该证书在业务语境下是否属于“官方”证书。

建议字段：

```text
official_status:
- official
- unofficial
- null

official_status_source:
- manual
- null

official_status_updated_at:
- ISO datetime | null
```

设计要求：

- `official_status` 默认必须为 `null`，表示尚未人工判断。
- 该字段只能由用户手动添加、修改或清空，AI / OCR / 规则不得自动写为 `official` 或 `unofficial`。
- AI 可以在待确认信息中提供证据文本，但不能替代人工标签。
- 该字段是“证书本身在业务上的官方 / 非官方标签”，不要和 `issuer_authority_*` 混用。
- 修改该字段需要写入 `audit_logs`。
- 查询和导出可以展示该标签，但默认不应把 `null` 当作非官方。

#### 颁发机构权威性字段说明

`issuer_authority_*` 字段用于 P2 阶段表达颁发机构权威性 / 正当性 / 可信度。

字段建议：

```text
issuer_authority_level:
- high
- medium
- low
- unknown

issuer_authority_score:
- 0 到 100 的整数分数

issuer_authority_source:
- manual
- ai
- rule
- unknown

issuer_authority_review_status:
- confirmed
- pending_review
- rejected
```

设计要求：

- 人工标记可以直接写入这些字段。
- AI / 规则识别结果也可以写入，但应标记来源。
- 未确认结果应进入 `pending_review`。
- 不要用这些字段替代 `recognition_status`。
- `recognition_status` 仍然表示证书在本次业务中是否被认可。


### 19.7 issuers，P2 可选扩展表

P2 阶段如果需要沉淀颁发机构权威性库，可新增独立 `issuers` 表。

```sql
CREATE TABLE issuers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT,
  authority_level TEXT,
  authority_score INTEGER,
  authority_source TEXT,
  authority_reason TEXT,
  review_status TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

用途：

```text
同一个机构只需要标记一次
后续所有证书复用这个机构权威性
支持机构别名归一化
支持人工维护权威机构库
支持 AI / 规则辅助识别
支持批量更新同机构证书
```

未来 `licenses` 表可增加：

```sql
issuer_id TEXT
```

用于关联 `issuers.id`。

示例：

```text
中华人民共和国住房和城乡建设部
住建部
住房城乡建设部
```

可归一到同一个 `issuer_id`。


### 19.8 review_items

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

### 19.8.1 categories，P1 配置化

MVP 可以使用内置类别列表：

```text
工程
环境
消防员
未识别类别
```

P1 可新增配置表：

```sql
CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);
```

说明：

- [P1] 主类别和查询可选类别来自配置表。
- [P1] 查询和导出支持多选类别。
- [P1] 导出需要显示本次选择的类别范围和匹配逻辑。

### 19.9 export_jobs

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

### 19.10 license_match_logs

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

### 19.11 audit_logs

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
