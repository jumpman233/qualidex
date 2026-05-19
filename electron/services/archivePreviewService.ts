import type Database from 'better-sqlite3'
import path from 'node:path'

export interface ArchivePreviewItem {
  personId: string | null
  personName: string | null
  fileId: string
  sourcePath: string
  targetPath: string
  targetRelativePath: string
  primaryCategory: string
  region: string
  personFolder: string
  documentFolder: string
  documentType: string | null
  isMultiPersonFile: boolean
  needsReview: boolean
  reviewReasons: string[]
  hasConflict: boolean
  conflictReason: string | null
}

export interface ArchivePreviewResult {
  outputRoot: string
  totalItems: number
  conflictItems: number
  reviewItems: number
  items: ArchivePreviewItem[]
}

interface ArchivePreviewRow {
  person_id: string | null
  person_name: string | null
  id_card_last4: string | null
  person_primary_category: string | null
  person_region: string | null
  person_review_status: string | null
  file_id: string
  original_path: string
  file_name: string
  file_process_status: string | null
  file_is_multi_person_file: number | null
  document_type: string | null
  document_target_category: string | null
  document_relation_type: string | null
  document_needs_review: number | null
  document_review_reason: string | null
  license_primary_category: string | null
  license_region: string | null
  license_needs_review: number | null
  license_recognition_status: string | null
}

const UNKNOWN_CATEGORY = '未识别类别'
const UNKNOWN_REGION = '未划分区域'
const MULTI_PERSON_FOLDER = '_多人员资料'
const REVIEW_FOLDER = '99_待确认'

export function generateArchivePreview(
  db: Database.Database,
  outputRoot: string,
): ArchivePreviewResult {
  const resolvedOutputRoot = path.resolve(outputRoot)
  const rows = readArchivePreviewRows(db)
  const items = rows.map((row) => buildPreviewItem(row, resolvedOutputRoot))

  markTargetConflicts(items)

  return {
    outputRoot: resolvedOutputRoot,
    totalItems: items.length,
    conflictItems: items.filter((item) => item.hasConflict).length,
    reviewItems: items.filter((item) => item.needsReview).length,
    items,
  }
}

function readArchivePreviewRows(db: Database.Database): ArchivePreviewRow[] {
  return db.prepare(`
    SELECT
      people.id AS person_id,
      people.name AS person_name,
      people.id_card_last4,
      people.primary_category AS person_primary_category,
      people.region AS person_region,
      people.review_status AS person_review_status,
      files.id AS file_id,
      files.original_path,
      files.file_name,
      files.process_status AS file_process_status,
      files.is_multi_person_file AS file_is_multi_person_file,
      person_documents.document_type,
      person_documents.target_category AS document_target_category,
      person_documents.relation_type AS document_relation_type,
      person_documents.needs_review AS document_needs_review,
      person_documents.review_reason AS document_review_reason,
      licenses.primary_category AS license_primary_category,
      licenses.region AS license_region,
      licenses.needs_review AS license_needs_review,
      licenses.recognition_status AS license_recognition_status
    FROM person_documents
    INNER JOIN files ON files.id = person_documents.file_id
    LEFT JOIN people ON people.id = person_documents.person_id
    LEFT JOIN licenses ON licenses.file_id = files.id AND licenses.person_id = people.id
    WHERE person_documents.status = 'active'
      AND files.deleted_at IS NULL
      AND files.archive_status != 'deleted'
      AND (people.id IS NULL OR (people.status = 'active' AND people.deleted_at IS NULL))
    ORDER BY people.primary_category, people.region, people.name, files.file_name
  `).all() as ArchivePreviewRow[]
}

function buildPreviewItem(row: ArchivePreviewRow, outputRoot: string): ArchivePreviewItem {
  const primaryCategory = sanitizePathSegment(
    row.document_target_category
      ?? row.license_primary_category
      ?? row.person_primary_category
      ?? UNKNOWN_CATEGORY,
  )
  const region = sanitizePathSegment(row.license_region ?? row.person_region ?? UNKNOWN_REGION)
  const isMultiPersonFile = Boolean(row.file_is_multi_person_file) || row.document_relation_type === 'multi_person'
  const reviewReasons = collectReviewReasons(row)
  const needsReview = reviewReasons.length > 0
  const documentFolder = isMultiPersonFile
    ? MULTI_PERSON_FOLDER
    : needsReview
      ? REVIEW_FOLDER
      : resolveDocumentFolder(row.document_type)
  const personFolder = resolvePersonFolder(row)
  const targetRelativePath = isMultiPersonFile
    ? path.join(
        primaryCategory,
        region,
        MULTI_PERSON_FOLDER,
        sanitizePathSegment(`多人员资料_${stripExtension(row.file_name)}`),
        sanitizeFileName(row.file_name),
      )
    : path.join(
        primaryCategory,
        region,
        personFolder,
        documentFolder,
        sanitizeFileName(row.file_name),
      )
  const targetPath = path.resolve(outputRoot, targetRelativePath)
  const escapeReason = isPathInside(outputRoot, targetPath) ? null : '目标路径越界'

  return {
    personId: row.person_id,
    personName: row.person_name,
    fileId: row.file_id,
    sourcePath: row.original_path,
    targetPath,
    targetRelativePath,
    primaryCategory,
    region,
    personFolder,
    documentFolder,
    documentType: row.document_type,
    isMultiPersonFile,
    needsReview: Boolean(needsReview || escapeReason),
    reviewReasons: escapeReason ? [...reviewReasons, escapeReason] : reviewReasons,
    hasConflict: Boolean(escapeReason),
    conflictReason: escapeReason,
  }
}

function collectReviewReasons(row: ArchivePreviewRow): string[] {
  const reasons = new Set<string>()

  if (row.document_needs_review) {
    reasons.add(row.document_review_reason || '资料关联需要确认')
  }
  if (row.license_needs_review || row.license_recognition_status === 'pending_review') {
    reasons.add('证书识别需要确认')
  }
  if (row.person_review_status === 'pending_review') {
    reasons.add('人员信息需要确认')
  }
  if (row.file_process_status === 'needs_review') {
    reasons.add('识别结果需要确认')
  }
  if (!row.person_name) {
    reasons.add('人员姓名未知')
  }
  if (!row.person_region && !row.license_region) {
    reasons.add('地区未知')
  }
  if (!row.person_primary_category && !row.document_target_category && !row.license_primary_category) {
    reasons.add('主类别未知')
  }
  if (!row.document_type || row.document_type === 'unknown') {
    reasons.add('资料类型未知')
  }
  if (row.file_is_multi_person_file || row.document_relation_type === 'multi_person') {
    reasons.add('多人员资料')
  }

  return [...reasons]
}

function resolvePersonFolder(row: ArchivePreviewRow): string {
  const name = sanitizePathSegment(row.person_name ?? '未知人员')

  if (row.id_card_last4) {
    return sanitizePathSegment(`${name}_${row.id_card_last4}`)
  }

  const personNumber = row.person_id ? stablePersonNumber(row.person_id) : 'P000000'
  return sanitizePathSegment(`${name}_${personNumber}`)
}

function resolveDocumentFolder(documentType: string | null): string {
  if (documentType === 'id_card') {
    return '01_身份证'
  }
  if (documentType === 'diploma' || documentType === 'degree') {
    return '02_学历'
  }
  if (documentType === 'license') {
    return '03_证书资料'
  }
  if (documentType === 'other') {
    return '04_其他资料'
  }

  return REVIEW_FOLDER
}

function markTargetConflicts(items: ArchivePreviewItem[]): void {
  const byTarget = new Map<string, ArchivePreviewItem[]>()

  for (const item of items) {
    const key = item.targetPath.toLocaleLowerCase()
    const group = byTarget.get(key) ?? []
    group.push(item)
    byTarget.set(key, group)
  }

  for (const group of byTarget.values()) {
    if (group.length < 2) {
      continue
    }

    for (const item of group) {
      item.hasConflict = true
      item.conflictReason = '多个文件将生成到同一目标路径'
      item.needsReview = true
      if (!item.reviewReasons.includes(item.conflictReason)) {
        item.reviewReasons.push(item.conflictReason)
      }
    }
  }
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .split('')
    .map((char) => (isUnsafePathChar(char) ? '_' : char))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()

  return sanitized || '未命名'
}

function isUnsafePathChar(char: string): boolean {
  return '<>:"/\\|?*'.includes(char) || char.charCodeAt(0) < 32
}

function sanitizeFileName(value: string): string {
  return sanitizePathSegment(value)
}

function stripExtension(fileName: string): string {
  return fileName.slice(0, fileName.length - path.extname(fileName).length) || fileName
}

function stablePersonNumber(personId: string): string {
  const digits = personId.replace(/\D/g, '').slice(-6)
  if (digits) {
    return `P${digits.padStart(6, '0')}`
  }

  const code = [...personId].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return `P${String(code % 1_000_000).padStart(6, '0')}`
}

function isPathInside(rootPath: string, targetPath: string): boolean {
  const relative = path.relative(rootPath, targetPath)
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative)
}
