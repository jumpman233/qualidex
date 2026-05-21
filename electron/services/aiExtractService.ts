import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { loadAiModelConfig, type AiModelConfig } from './aiConfig'
import { sanitizeIdCardsForAi } from './idCardService'
import { persistStructuredRecognition } from './structuredRecognitionService'

export interface AiExtractionInput {
  fileId: string
  fileName: string
  originalPath: string
  parentFolder: string
  ocrText: string
  defaultPrimaryCategory?: string | null
  defaultRegion?: string | null
}

export interface AiLicenseResult {
  raw_license_name: string | null
  normalized_license_name: string | null
  license_category: string | null
  issuing_authority: string | null
  valid_until: string | null
  is_license_candidate: boolean
}

export interface AiExtractionResult {
  document_type: string
  category: {
    primary_value: string | null
    candidate_values: string[]
    source: string
    confidence: number
    needs_manual_review: boolean
  }
  person: {
    name: string | null
    id_card_last4: string | null
    masked_display: string | null
  }
  region: {
    value: string | null
    source: string
    confidence: number
  }
  education: {
    level: string | null
    school: string | null
    major: string | null
  }
  license: AiLicenseResult
  licenses: AiLicenseResult[]
  multi_person: {
    is_multi_person_file: boolean
    detected_people: Array<{
      name: string | null
      id_card_last4: string | null
      masked_display: string | null
    }>
  }
  confidence: number
  needs_manual_review: boolean
  review_reasons: string[]
  evidence: string[]
}

export interface AiExtractionPersistedResult {
  status: 'ai_extracted' | 'needs_review' | 'ai_skipped' | 'ai_extract_failed'
  result: AiExtractionResult | null
  error: string | null
  reviewReasons: string[]
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const CONFIDENCE_REVIEW_THRESHOLD = 0.8
const MAX_OCR_TEXT_CHARS = 12_000

export async function extractAndPersistAiSuggestions(
  db: Database.Database,
  input: AiExtractionInput,
): Promise<AiExtractionPersistedResult> {
  if (!input.ocrText.trim()) {
    return {
      status: 'ai_skipped',
      result: null,
      error: '没有 OCR 文本，跳过 AI 抽取。',
      reviewReasons: [],
    }
  }

  const config = loadAiModelConfig()
  if (!config) {
    return {
      status: 'ai_skipped',
      result: null,
      error: '未配置 AI_PROVIDER / AI_BASE_URL / AI_MODEL_NAME / AI_API_KEY。',
      reviewReasons: [],
    }
  }

  try {
    const result = await extractStructuredFields(config, input)
    const reviewReasons = collectReviewReasons(result)
    const status = reviewReasons.length > 0 ? 'needs_review' : 'ai_extracted'
    persistAiResult(db, input, config, status, result, null, reviewReasons)
    persistReviewItems(db, input.fileId, reviewReasons, result)
    persistStructuredRecognition(db, input, result, reviewReasons)

    return {
      status,
      result,
      error: null,
      reviewReasons,
    }
  } catch (error) {
    const message = getErrorMessage(error)
    persistAiResult(db, input, config, 'ai_extract_failed', null, message, ['AI 抽取失败'])
    persistReviewItems(db, input.fileId, ['AI 抽取失败'], null)

    return {
      status: 'ai_extract_failed',
      result: null,
      error: message,
      reviewReasons: ['AI 抽取失败'],
    }
  }
}

export async function extractStructuredFields(
  config: AiModelConfig,
  input: AiExtractionInput,
): Promise<AiExtractionResult> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.modelName,
      temperature: 0,
      ...(config.useJsonResponseFormat ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify(buildUserPayload(input), null, 2),
        },
      ],
    }),
  })

  const responseText = await response.text()
  if (!response.ok) {
    throw new Error(`AI API 请求失败：${response.status} ${responseText.slice(0, 500)}`)
  }

  const payload = JSON.parse(responseText) as ChatCompletionResponse
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('AI API 没有返回 message.content。')
  }

  return normalizeExtractionResult(JSON.parse(extractJsonObject(content)))
}

function buildSystemPrompt(): string {
  return [
    '你是 Qualidex 的人员资料结构化抽取助手。',
    '你只能基于用户提供的 OCR 文本、文件名、原始路径、上级文件夹名和用户默认值进行抽取。',
    '不要编造任何字段；不确定时返回 null、unknown 或空数组。',
    '你不能把建议当成最终事实；低置信度、字段冲突、多人资料、未知人员、未知类别、未知地区都必须 needs_manual_review=true。',
    '类别规则：primary_value 只能给一个主类别；candidate_values 可以给多个候选类别。',
    '证书规则：一个人员可以有多条证书；licenses 必须输出全部证书候选，license 字段保留为第一条证书以兼容旧流程。',
    '隐私规则：身份证号只能输出后四位 id_card_last4 和脱敏值 masked_display，不要输出完整身份证号。',
    '必须只输出 JSON，不要输出 Markdown 或解释文字。',
  ].join('\n')
}

function buildUserPayload(input: AiExtractionInput) {
  return {
    task: 'extract_personnel_document_fields',
    output_schema: {
      document_type: 'id_card | diploma | degree | license | unknown | other',
      category: {
        primary_value: 'string | null',
        candidate_values: ['string'],
        source: 'user_input | folder_path | file_name | ocr_text | unknown',
        confidence: 'number 0-1',
        needs_manual_review: 'boolean',
      },
      person: {
        name: 'string | null',
        id_card_last4: 'string | null',
        masked_display: 'string | null',
      },
      region: {
        value: 'string | null',
        source: 'folder_path | file_name | ocr_text | unknown',
        confidence: 'number 0-1',
      },
      education: {
        level: 'string | null',
        school: 'string | null',
        major: 'string | null',
      },
      license: {
        raw_license_name: 'string | null',
        normalized_license_name: 'string | null',
        license_category: 'string | null',
        issuing_authority: 'string | null',
        valid_until: 'YYYY-MM-DD | null',
        is_license_candidate: 'boolean',
      },
      licenses: [{
        raw_license_name: 'string | null',
        normalized_license_name: 'string | null',
        license_category: 'string | null',
        issuing_authority: 'string | null',
        valid_until: 'YYYY-MM-DD | null',
        is_license_candidate: 'boolean',
      }],
      multi_person: {
        is_multi_person_file: 'boolean',
        detected_people: [{ name: 'string | null', id_card_last4: 'string | null', masked_display: 'string | null' }],
      },
      confidence: 'number 0-1',
      needs_manual_review: 'boolean',
      review_reasons: ['string'],
      evidence: ['string'],
    },
    file: {
      id: input.fileId,
      file_name: sanitizeIdCardsForAi(input.fileName),
      original_path: sanitizeIdCardsForAi(input.originalPath),
      parent_folder: sanitizeIdCardsForAi(input.parentFolder),
    },
    user_defaults: {
      primary_category: input.defaultPrimaryCategory ?? null,
      region: input.defaultRegion ?? null,
    },
    ocr_text: sanitizeIdCardsForAi(input.ocrText).slice(0, MAX_OCR_TEXT_CHARS),
  }
}

function normalizeExtractionResult(value: unknown): AiExtractionResult {
  const record = asRecord(value)
  const category = asRecord(record.category)
  const person = asRecord(record.person)
  const region = asRecord(record.region)
  const education = asRecord(record.education)
  const license = normalizeLicense(record.license)
  const licenses = normalizeLicenses(record.licenses, license)
  const compatibleLicense = hasLicenseSignal(license) ? license : licenses[0] ?? license
  const multiPerson = asRecord(record.multi_person)

  return {
    document_type: asString(record.document_type, 'unknown'),
    category: {
      primary_value: nullableString(category.primary_value),
      candidate_values: asStringArray(category.candidate_values),
      source: asString(category.source, 'unknown'),
      confidence: asConfidence(category.confidence),
      needs_manual_review: Boolean(category.needs_manual_review),
    },
    person: {
      name: nullableString(person.name),
      id_card_last4: normalizeLast4(person.id_card_last4),
      masked_display: sanitizeNullableIdCardOutput(person.masked_display),
    },
    region: {
      value: nullableString(region.value),
      source: asString(region.source, 'unknown'),
      confidence: asConfidence(region.confidence),
    },
    education: {
      level: nullableString(education.level),
      school: nullableString(education.school),
      major: nullableString(education.major),
    },
    license: compatibleLicense,
    licenses,
    multi_person: {
      is_multi_person_file: Boolean(multiPerson.is_multi_person_file),
      detected_people: normalizeDetectedPeople(multiPerson.detected_people),
    },
    confidence: asConfidence(record.confidence),
    needs_manual_review: Boolean(record.needs_manual_review),
    review_reasons: asStringArray(record.review_reasons),
    evidence: asStringArray(record.evidence),
  }
}

function collectReviewReasons(result: AiExtractionResult): string[] {
  const reasons = new Set(result.review_reasons.filter((reason) => reason.trim().length > 0))

  if (result.needs_manual_review) {
    reasons.add('AI 标记需要人工确认')
  }
  if (result.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    reasons.add('整体置信度低')
  }
  if (!result.person.name) {
    reasons.add('人员姓名未知')
  }
  if (!result.category.primary_value || result.category.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    reasons.add('主类别未知或置信度低')
  }
  if (!result.region.value || result.region.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    reasons.add('地区未知或置信度低')
  }
  if (result.category.needs_manual_review) {
    reasons.add('类别需要人工确认')
  }
  if (result.multi_person.is_multi_person_file) {
    reasons.add('疑似多人资料')
  }
  if (result.licenses.some((license) => license.is_license_candidate && !license.normalized_license_name)) {
    reasons.add('证书名称未知')
  }

  return [...reasons]
}

function persistAiResult(
  db: Database.Database,
  input: AiExtractionInput,
  config: AiModelConfig,
  status: string,
  result: AiExtractionResult | null,
  error: string | null,
  reviewReasons: string[],
): void {
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO ai_extract_results (
      id,
      file_id,
      provider,
      model_name,
      status,
      confidence,
      needs_manual_review,
      review_reasons,
      result_json,
      error,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @fileId,
      @provider,
      @modelName,
      @status,
      @confidence,
      @needsManualReview,
      @reviewReasons,
      @resultJson,
      @error,
      @createdAt,
      @updatedAt
    )
  `).run({
    id: randomUUID(),
    fileId: input.fileId,
    provider: config.provider,
    modelName: config.modelName,
    status,
    confidence: result?.confidence ?? null,
    needsManualReview: reviewReasons.length > 0 ? 1 : 0,
    reviewReasons: JSON.stringify(reviewReasons),
    resultJson: result ? JSON.stringify(result) : null,
    error,
    createdAt: now,
    updatedAt: now,
  })
}

function persistReviewItems(
  db: Database.Database,
  fileId: string,
  reviewReasons: string[],
  result: AiExtractionResult | null,
): void {
  const now = new Date().toISOString()
  const insertReview = db.prepare(`
    INSERT INTO review_items (
      id,
      item_type,
      ref_id,
      reason,
      status,
      suggested_value,
      confirmed_value,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @itemType,
      @refId,
      @reason,
      @status,
      @suggestedValue,
      NULL,
      @createdAt,
      @updatedAt
    )
  `)

  for (const reason of reviewReasons) {
    insertReview.run({
      id: randomUUID(),
      itemType: toReviewItemType(reason),
      refId: fileId,
      reason,
      status: 'pending',
      suggestedValue: result ? JSON.stringify(result) : null,
      createdAt: now,
      updatedAt: now,
    })
  }
}

function toReviewItemType(reason: string): string {
  if (reason.includes('人员')) {
    return 'person_unknown'
  }
  if (reason.includes('类别')) {
    return 'primary_category_unknown'
  }
  if (reason.includes('地区')) {
    return 'region_unknown'
  }
  if (reason.includes('多人')) {
    return 'multi_person_file'
  }
  if (reason.includes('失败')) {
    return 'ai_extract_failed'
  }
  return 'ai_uncertain'
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fencedMatch) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1)
  }

  return trimmed
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === 'unknown' || trimmed === 'null') {
    return null
  }

  return trimmed
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function asConfidence(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.min(Math.max(parsed, 0), 1)
}

function normalizeLast4(value: unknown): string | null {
  const normalized = nullableString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : normalized
}

function normalizeDetectedPeople(value: unknown): AiExtractionResult['multi_person']['detected_people'] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = asRecord(item)
    return {
      name: nullableString(record.name),
      id_card_last4: normalizeLast4(record.id_card_last4),
      masked_display: sanitizeNullableIdCardOutput(record.masked_display),
    }
  })
}

function normalizeLicense(value: unknown): AiLicenseResult {
  const license = asRecord(value)
  return {
    raw_license_name: nullableString(license.raw_license_name),
    normalized_license_name: nullableString(license.normalized_license_name),
    license_category: nullableString(license.license_category),
    issuing_authority: nullableString(license.issuing_authority),
    valid_until: nullableString(license.valid_until),
    is_license_candidate: Boolean(license.is_license_candidate),
  }
}

function normalizeLicenses(value: unknown, fallbackLicense: AiLicenseResult): AiLicenseResult[] {
  const licenses = Array.isArray(value)
    ? value.map((item) => normalizeLicense(item))
    : []
  const candidates = licenses.filter(hasLicenseSignal)

  if (candidates.length > 0) {
    return candidates
  }

  return hasLicenseSignal(fallbackLicense) ? [fallbackLicense] : []
}

function hasLicenseSignal(license: AiLicenseResult): boolean {
  return license.is_license_candidate
    || Boolean(license.raw_license_name)
    || Boolean(license.normalized_license_name)
    || Boolean(license.license_category)
    || Boolean(license.issuing_authority)
}

function sanitizeNullableIdCardOutput(value: unknown): string | null {
  const normalized = nullableString(value)
  return normalized ? sanitizeIdCardsForAi(normalized) : null
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
