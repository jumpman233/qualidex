import type Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { utils, writeFile } from 'xlsx'

export interface RecognitionReviewExportResult {
  outputPath: string
  rowCount: number
}

interface RecognitionReviewRow {
  file_id: string
  file_name: string
  original_path: string
  parent_folder: string | null
  ocr_status: string | null
  process_status: string | null
  process_error: string | null
  ocr_text: string | null
  ai_status: string | null
  ai_confidence: number | null
  ai_needs_manual_review: number | null
  ai_review_reasons: string | null
  ai_result_json: string | null
}

interface ParsedAiResult {
  document_type?: string
  category?: {
    primary_value?: string | null
    candidate_values?: string[]
    confidence?: number
  }
  person?: {
    name?: string | null
    id_card_last4?: string | null
  }
  region?: {
    value?: string | null
    confidence?: number
  }
  education?: {
    level?: string | null
    school?: string | null
    major?: string | null
  }
  license?: {
    raw_license_name?: string | null
    normalized_license_name?: string | null
    license_category?: string | null
    issuing_authority?: string | null
    valid_until?: string | null
  }
  multi_person?: {
    is_multi_person_file?: boolean
  }
  evidence?: string[]
}

const OCR_PREVIEW_LIMIT = 500

export function exportRecognitionReviewExcel(
  db: Database.Database,
  outputPath: string,
): RecognitionReviewExportResult {
  const rows = getRecognitionReviewRows(db)
  const sheetRows = rows.map(toWorksheetRow)
  const worksheet = utils.json_to_sheet(sheetRows)
  worksheet['!cols'] = [
    { wch: 24 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 30 },
    { wch: 60 },
    { wch: 48 },
  ]

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, '识别验收')

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFile(workbook, outputPath)

  return {
    outputPath,
    rowCount: rows.length,
  }
}

function getRecognitionReviewRows(db: Database.Database): RecognitionReviewRow[] {
  return db.prepare(`
    SELECT
      files.id AS file_id,
      files.file_name,
      files.original_path,
      files.parent_folder,
      files.ocr_status,
      files.process_status,
      files.process_error,
      files.ocr_text,
      latest_ai.status AS ai_status,
      latest_ai.confidence AS ai_confidence,
      latest_ai.needs_manual_review AS ai_needs_manual_review,
      latest_ai.review_reasons AS ai_review_reasons,
      latest_ai.result_json AS ai_result_json
    FROM files
    LEFT JOIN (
      SELECT ai_extract_results.*
      FROM ai_extract_results
      INNER JOIN (
        SELECT file_id, MAX(created_at) AS latest_created_at
        FROM ai_extract_results
        GROUP BY file_id
      ) latest
        ON latest.file_id = ai_extract_results.file_id
        AND latest.latest_created_at = ai_extract_results.created_at
    ) latest_ai ON latest_ai.file_id = files.id
    WHERE files.deleted_at IS NULL
    ORDER BY files.created_at ASC, files.file_name ASC
  `).all() as RecognitionReviewRow[]
}

function toWorksheetRow(row: RecognitionReviewRow): Record<string, string | number> {
  const result = parseAiResult(row.ai_result_json)
  const reviewReasons = parseStringArray(row.ai_review_reasons)

  return {
    文件名: row.file_name,
    文档类型: result.document_type ?? '',
    姓名: result.person?.name ?? '',
    身份证后四位: result.person?.id_card_last4 ?? '',
    主类别: result.category?.primary_value ?? '',
    候选类别: joinValues(result.category?.candidate_values),
    地区: result.region?.value ?? '',
    学历层次: result.education?.level ?? '',
    学校: result.education?.school ?? '',
    专业: result.education?.major ?? '',
    证书原名: result.license?.raw_license_name ?? '',
    证书归一名: result.license?.normalized_license_name ?? '',
    证书类别: result.license?.license_category ?? '',
    发证机构: result.license?.issuing_authority ?? '',
    有效期至: result.license?.valid_until ?? '',
    OCR状态: row.ocr_status ?? '',
    AI状态: row.ai_status ?? '',
    AI置信度: row.ai_confidence ?? '',
    是否待确认: row.ai_needs_manual_review ? '是' : '否',
    待确认原因: reviewReasons.join('；'),
    多人员资料: result.multi_person?.is_multi_person_file ? '是' : '否',
    依据: joinValues(result.evidence),
    OCR文本预览: createPreview(row.ocr_text ?? ''),
    处理错误: row.process_error ?? '',
    原始路径: row.original_path,
    上级文件夹: row.parent_folder ?? '',
    文件ID: row.file_id,
  }
}

function parseAiResult(value: string | null): ParsedAiResult {
  if (!value) {
    return {}
  }

  try {
    return JSON.parse(value) as ParsedAiResult
  } catch {
    return {}
  }
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function joinValues(values: string[] | undefined): string {
  return values?.filter(Boolean).join('；') ?? ''
}

function createPreview(text: string): string {
  const normalizedText = text.replace(/\s+/g, ' ').trim()
  return normalizedText.length > OCR_PREVIEW_LIMIT
    ? `${normalizedText.slice(0, OCR_PREVIEW_LIMIT)}...`
    : normalizedText
}
