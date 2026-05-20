import type Database from 'better-sqlite3'
import { constants, mkdirSync } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { utils, writeFile } from 'xlsx'
import {
  queryPeople,
  normalizeConditions,
  type QueryPeopleConditions,
  type QueryPersonResult,
} from './queryService'

export interface RecognitionReviewExportResult {
  outputPath: string
  rowCount: number
}

export interface QueryResultsExcelExportResult {
  exportJobId: string
  outputPath: string
  rowCount: number
}

export interface QueryFilesExportItem {
  personId: string
  fileId: string
  sourcePath: string
  targetPath: string
  status: 'copied' | 'skipped_existing' | 'failed'
  reason: string | null
}

export interface QueryFilesExportResult {
  exportJobId: string
  outputRoot: string
  selectedPeople: string[]
  totalItems: number
  copiedItems: number
  skippedExistingItems: number
  failedItems: number
  results: QueryFilesExportItem[]
}

interface PersonFileExportRow {
  person_id: string
  person_name: string | null
  primary_category: string | null
  region: string | null
  file_id: string
  file_name: string
  original_path: string
  document_type: string | null
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

export function exportQueryResultsExcel(
  db: Database.Database,
  conditions: QueryPeopleConditions,
  outputPath: string,
): QueryResultsExcelExportResult {
  const normalizedConditions = normalizeConditions(conditions)
  const rows = queryPeople(db, normalizedConditions)
  const worksheet = utils.json_to_sheet(rows.map(toQueryWorksheetRow))
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 30 },
    { wch: 12 },
    { wch: 40 },
  ]

  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, '查询结果')

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFile(workbook, outputPath)

  const exportJobId = insertExportJob(db, {
    conditions: normalizedConditions,
    selectedPeople: rows.map((row) => row.personId),
    outputType: 'query_excel',
    outputPath,
    status: 'completed',
  })

  return {
    exportJobId,
    outputPath,
    rowCount: rows.length,
  }
}

export async function exportQueryResultFiles(
  db: Database.Database,
  conditions: QueryPeopleConditions,
  outputRoot: string,
): Promise<QueryFilesExportResult> {
  const normalizedConditions = normalizeConditions(conditions)
  const people = queryPeople(db, normalizedConditions)
  const selectedPeople = people.map((person) => person.personId)
  const rows = selectedPeople.length > 0 ? readPersonFiles(db, selectedPeople) : []
  const resolvedOutputRoot = path.resolve(outputRoot)
  const results: QueryFilesExportItem[] = []

  await mkdir(resolvedOutputRoot, { recursive: true })

  for (const row of rows) {
    const targetPath = buildExportTargetPath(resolvedOutputRoot, row)
    if (!isPathInside(resolvedOutputRoot, targetPath)) {
      results.push(toFileExportResult(row, targetPath, 'failed', '目标路径越界'))
      continue
    }

    try {
      await mkdir(path.dirname(targetPath), { recursive: true })
      await copyFile(row.original_path, targetPath, constants.COPYFILE_EXCL)
      results.push(toFileExportResult(row, targetPath, 'copied', null))
    } catch (error) {
      const message = getErrorMessage(error)
      results.push(toFileExportResult(
        row,
        targetPath,
        message.includes('EEXIST') ? 'skipped_existing' : 'failed',
        message,
      ))
    }
  }

  const exportJobId = insertExportJob(db, {
    conditions: normalizedConditions,
    selectedPeople,
    outputType: 'query_files',
    outputPath: resolvedOutputRoot,
    status: results.some((result) => result.status === 'failed') ? 'partial_failed' : 'completed',
  })

  return {
    exportJobId,
    outputRoot: resolvedOutputRoot,
    selectedPeople,
    totalItems: results.length,
    copiedItems: countFileExportStatus(results, 'copied'),
    skippedExistingItems: countFileExportStatus(results, 'skipped_existing'),
    failedItems: countFileExportStatus(results, 'failed'),
    results,
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

function toQueryWorksheetRow(row: QueryPersonResult): Record<string, string | number> {
  return {
    姓名: row.name ?? '',
    身份证后四位: row.idCardLast4 ?? '',
    主类别: row.primaryCategory ?? '',
    地区: row.region ?? '',
    学历: row.educationLevel ?? '',
    证书: row.licenseNames.join('；'),
    资料数量: row.documentCount,
    匹配说明: row.matchReason,
  }
}

function readPersonFiles(db: Database.Database, personIds: string[]): PersonFileExportRow[] {
  const rows: PersonFileExportRow[] = []
  const readFiles = db.prepare(`
    SELECT
      people.id AS person_id,
      people.name AS person_name,
      people.primary_category,
      people.region,
      files.id AS file_id,
      files.file_name,
      files.original_path,
      person_documents.document_type
    FROM person_documents
    INNER JOIN people ON people.id = person_documents.person_id
    INNER JOIN files ON files.id = person_documents.file_id
    WHERE person_documents.person_id = @personId
      AND person_documents.status = 'active'
      AND files.deleted_at IS NULL
      AND files.archive_status != 'deleted'
  `)

  for (const personId of personIds) {
    rows.push(...readFiles.all({ personId }) as PersonFileExportRow[])
  }

  return rows
}

function buildExportTargetPath(outputRoot: string, row: PersonFileExportRow): string {
  const category = sanitizePathSegment(row.primary_category ?? '未识别类别')
  const region = sanitizePathSegment(row.region ?? '未划分区域')
  const person = sanitizePathSegment(`${row.person_name ?? '未知人员'}_${row.person_id.slice(0, 8)}`)
  const folder = sanitizePathSegment(documentTypeLabel(row.document_type))
  return path.join(outputRoot, category, region, person, folder, sanitizePathSegment(row.file_name))
}

function documentTypeLabel(documentType: string | null): string {
  const labels: Record<string, string> = {
    id_card: '01_身份证',
    diploma: '02_学历',
    degree: '03_学位',
    license: '04_证书',
    other: '99_其他资料',
  }

  return documentType ? labels[documentType] ?? documentType : '99_其他资料'
}

function toFileExportResult(
  row: PersonFileExportRow,
  targetPath: string,
  status: QueryFilesExportItem['status'],
  reason: string | null,
): QueryFilesExportItem {
  return {
    personId: row.person_id,
    fileId: row.file_id,
    sourcePath: row.original_path,
    targetPath,
    status,
    reason,
  }
}

function insertExportJob(
  db: Database.Database,
  input: {
    conditions: QueryPeopleConditions
    selectedPeople: string[]
    outputType: string
    outputPath: string
    status: string
  },
): string {
  const id = randomUUID()
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO export_jobs (
      id,
      query_text,
      parsed_conditions,
      selected_people,
      output_type,
      output_path,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @queryText,
      @parsedConditions,
      @selectedPeople,
      @outputType,
      @outputPath,
      @status,
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    queryText: createQueryText(input.conditions),
    parsedConditions: JSON.stringify(input.conditions),
    selectedPeople: JSON.stringify(input.selectedPeople),
    outputType: input.outputType,
    outputPath: input.outputPath,
    status: input.status,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

function createQueryText(conditions: QueryPeopleConditions): string {
  return [
    conditions.categories && conditions.categories.length > 0 ? `类别：${conditions.categories.join('、')}` : null,
    conditions.region ? `地区：${conditions.region}` : null,
    conditions.educationMin ? `学历不低于：${conditions.educationMin}` : null,
    conditions.licenseQuery ? `证书：${conditions.licenseQuery}` : null,
    conditions.includePendingReview ? '包含待确认' : '仅确认数据',
  ].filter(Boolean).join('；')
}

function sanitizePathSegment(value: string): string {
  const sanitized = Array.from(value)
    .map((char) => (/[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32 ? '_' : char))
    .join('')
    .trim()
  return sanitized || '未命名'
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function countFileExportStatus(results: QueryFilesExportItem[], status: QueryFilesExportItem['status']): number {
  return results.filter((result) => result.status === status).length
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
