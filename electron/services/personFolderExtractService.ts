import { randomUUID } from 'node:crypto'
import { extractIdCardNumbers, sanitizeIdCardsForAi, type NormalizedIdCard } from './idCardService'
import { loadAiModelConfig, type AiModelConfig } from './aiConfig'
import { scanDirectory, type ScannedFile } from './fileScanner'
import { extractTextFromFile, type TextExtractionStatus } from './textExtractService'

export interface PersonFolderExtractionOptions {
  maxFiles?: number
  maxTextCharsPerFile?: number
  maxCombinedTextChars?: number
  config?: AiModelConfig | null
}

export interface PersonFolderExtractedFile {
  fileName: string
  relativePath: string
  originalPath: string
  ext: string
  sizeBytes: number
  extractionStatus: TextExtractionStatus
  confidence: number | null
  error: string | null
  textPreview: string
}

export interface PersonFolderCertificate {
  certificateName: string | null
  certificateSpecialty: string | null
  displayName: string | null
  confidence: number | null
  evidence: string[]
}

export type PersonFolderFileRelationType = 'owner' | 'mentioned' | 'multi_person' | 'uncertain'

export interface PersonFolderPersonFile {
  fileName: string
  relativePath: string
  relationType: PersonFolderFileRelationType
  relationConfidence: number
  evidence: string[]
}

export interface PersonFolderExtractedPerson {
  personName: string | null
  idCardNumber: string | null
  idCardMaskedDisplay: string | null
  education: string | null
  certificates: PersonFolderCertificate[]
  confidence: number
  needsReview: boolean
  reviewReasons: string[]
  files: PersonFolderPersonFile[]
}

export interface PersonFolderExtractionResult {
  folderPath: string
  people: PersonFolderExtractedPerson[]
  files: PersonFolderExtractedFile[]
  unresolvedFiles: PersonFolderExtractedFile[]
  needsReview: boolean
  reviewReasons: string[]
  ai: {
    provider: string | null
    modelName: string | null
    status: 'extracted' | 'skipped' | 'failed'
    error: string | null
  }
}

interface PersonFolderAiFileRelation {
  relative_path: string
  relation_type: PersonFolderFileRelationType
  relation_confidence: number
  evidence: string[]
}

interface PersonFolderAiCertificateResult {
  certificate_name: string | null
  certificate_specialty: string | null
  confidence: number | null
  evidence: string[]
}

interface PersonFolderAiPersonResult {
  person_name: string | null
  id_card_last4: string | null
  masked_display: string | null
  education: string | null
  certificates: PersonFolderAiCertificateResult[]
  confidence: number
  needs_review: boolean
  review_reasons: string[]
  files: PersonFolderAiFileRelation[]
}

interface PersonFolderAiResult {
  people: PersonFolderAiPersonResult[]
  unresolved_files: string[]
  confidence: number
  needs_review: boolean
  review_reasons: string[]
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface ExtractedFileText {
  file: ScannedFile
  status: TextExtractionStatus
  text: string
  confidence: number | null
  error: string | null
  idCards: NormalizedIdCard[]
}

const DEFAULT_MAX_FILES = 100
const DEFAULT_MAX_TEXT_CHARS_PER_FILE = 6_000
const DEFAULT_MAX_COMBINED_TEXT_CHARS = 36_000
const TEXT_PREVIEW_CHARS = 300
const REVIEW_CONFIDENCE_THRESHOLD = 0.8

export async function extractPersonFolder(
  folderPath: string,
  options: PersonFolderExtractionOptions = {},
): Promise<PersonFolderExtractionResult> {
  const maxFiles = normalizeLimit(options.maxFiles, DEFAULT_MAX_FILES)
  const maxTextCharsPerFile = normalizeLimit(options.maxTextCharsPerFile, DEFAULT_MAX_TEXT_CHARS_PER_FILE)
  const maxCombinedTextChars = normalizeLimit(options.maxCombinedTextChars, DEFAULT_MAX_COMBINED_TEXT_CHARS)
  const scanResult = await scanDirectory(folderPath, { maxPreviewFiles: Number.MAX_SAFE_INTEGER })
  const supportedFiles = scanResult.files
    .filter((file) => file.isSupported)
    .slice(0, maxFiles)
  const extractedFiles = await extractFilesText(supportedFiles)
  const sanitizedCombinedText = buildCombinedText(extractedFiles, maxTextCharsPerFile, maxCombinedTextChars)
  const config = options.config === undefined ? loadAiModelConfig() : options.config
  const resultFiles = toResultFiles(extractedFiles)

  if (!config) {
    const localPeople = buildLocalPeople(extractedFiles)
    const reviewReasons = ['未配置 AI，已完成本地文本提取但未做文件夹级多人结构化抽取。']
    const unresolvedFiles = collectUnresolvedFiles(resultFiles, localPeople)

    return {
      folderPath: scanResult.rootPath,
      people: localPeople,
      files: resultFiles,
      unresolvedFiles,
      needsReview: true,
      reviewReasons,
      ai: {
        provider: null,
        modelName: null,
        status: 'skipped',
        error: '未配置 AI_PROVIDER / AI_BASE_URL / AI_MODEL_NAME / AI_API_KEY。',
      },
    }
  }

  try {
    const aiResult = await extractPersonFolderWithAi(config, {
      folderPath: scanResult.rootPath,
      files: extractedFiles,
      sanitizedCombinedText,
    })
    const people = mergeAiPeopleWithLocalIdCards(aiResult.people, extractedFiles)
    const unresolvedFiles = collectUnresolvedFiles(resultFiles, people, aiResult.unresolved_files)
    const reviewReasons = collectFolderReviewReasons(aiResult, people, unresolvedFiles)

    return {
      folderPath: scanResult.rootPath,
      people,
      files: resultFiles,
      unresolvedFiles,
      needsReview: aiResult.needs_review || reviewReasons.length > 0,
      reviewReasons,
      ai: {
        provider: config.provider,
        modelName: config.modelName,
        status: 'extracted',
        error: null,
      },
    }
  } catch (error) {
    return {
      folderPath: scanResult.rootPath,
      people: buildLocalPeople(extractedFiles),
      files: resultFiles,
      unresolvedFiles: resultFiles,
      needsReview: true,
      reviewReasons: ['AI 文件夹级多人抽取失败'],
      ai: {
        provider: config.provider,
        modelName: config.modelName,
        status: 'failed',
        error: getErrorMessage(error),
      },
    }
  }
}

async function extractFilesText(files: ScannedFile[]): Promise<ExtractedFileText[]> {
  const results: ExtractedFileText[] = []

  for (const file of files) {
    const extraction = await extractTextFromFile(file.path, file.ext)
    results.push({
      file,
      status: extraction.status,
      text: extraction.text,
      confidence: extraction.confidence,
      error: extraction.error,
      idCards: extractIdCardNumbers(extraction.text),
    })
  }

  return results
}

async function extractPersonFolderWithAi(
  config: AiModelConfig,
  input: {
    folderPath: string
    files: ExtractedFileText[]
    sanitizedCombinedText: string
  },
): Promise<PersonFolderAiResult> {
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
          content: JSON.stringify(buildAiPayload(input.folderPath, input.files, input.sanitizedCombinedText), null, 2),
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

  return normalizeAiResult(JSON.parse(extractJsonObject(content)))
}

function buildSystemPrompt(): string {
  return [
    '你是 Qualidex 的人员文件夹级多人资料抽取助手。',
    '用户会提供一个文件夹内多个证件或资料文件的 OCR 文本，文件夹内可能包含多个人员。',
    '你需要先区分人员，再分别输出每个人的姓名、学历、多个证书名称与对应专业、置信度、关联文件。',
    '证书名称和证书专业必须一一对应；如果证书有名称但专业未知，certificate_specialty 返回 null。',
    '关联文件必须使用输入中的 relative_path，并为每个关联给出 relation_type 和 relation_confidence。',
    '如果一个文件包含多个人员，文件应关联到所有涉及人员，relation_type 使用 multi_person。',
    '允许基于姓名和路径临时归并，但这种人员必须 needs_review=true，并说明原因。',
    '不要编造；不确定时返回 null、空数组或 unresolved_files，并在 review_reasons 中说明。',
    '隐私规则：输入中的身份证号已经脱敏，你不得输出完整身份证号。',
    '必须只输出 JSON，不要输出 Markdown 或解释文字。',
  ].join('\n')
}

function buildAiPayload(folderPath: string, files: ExtractedFileText[], sanitizedCombinedText: string) {
  return {
    task: 'extract_multi_person_folder_summary',
    output_schema: {
      people: [{
        person_name: 'string | null',
        id_card_last4: 'string | null',
        masked_display: 'string | null',
        education: 'string | null',
        certificates: [{
          certificate_name: 'string | null',
          certificate_specialty: 'string | null',
          confidence: 'number 0-1 | null',
          evidence: ['string'],
        }],
        confidence: 'number 0-1',
        needs_review: 'boolean',
        review_reasons: ['string'],
        files: [{
          relative_path: 'string',
          relation_type: 'owner | mentioned | multi_person | uncertain',
          relation_confidence: 'number 0-1',
          evidence: ['string'],
        }],
      }],
      unresolved_files: ['relative_path string'],
      confidence: 'number 0-1',
      needs_review: 'boolean',
      review_reasons: ['string'],
    },
    folder: {
      path: sanitizeIdCardsForAi(folderPath),
    },
    files: files.map((item) => ({
      file_name: sanitizeIdCardsForAi(item.file.name),
      relative_path: sanitizeIdCardsForAi(item.file.relativePath),
      extraction_status: item.status,
      confidence: item.confidence,
      error: item.error,
      detected_id_card_last4_values: item.idCards.map((idCard) => idCard.idCardLast4),
      detected_id_card_masked_values: item.idCards.map((idCard) => idCard.maskedDisplay),
    })),
    combined_ocr_text: sanitizedCombinedText,
  }
}

function mergeAiPeopleWithLocalIdCards(
  aiPeople: PersonFolderAiPersonResult[],
  files: ExtractedFileText[],
): PersonFolderExtractedPerson[] {
  const allLocalIdCards = getUniqueIdCards(files.flatMap((file) => file.idCards))
  const usedKeys = new Set<string>()
  const people = aiPeople.map((person) => {
    const idCard = findLocalIdCardForAiPerson(person, files, allLocalIdCards)
    if (idCard) {
      usedKeys.add(idCard.idCardHash)
    }
    return normalizePerson(person, idCard, files)
  })

  for (const idCard of allLocalIdCards) {
    if (usedKeys.has(idCard.idCardHash)) {
      continue
    }
    people.push(createLocalPersonFromIdCard(idCard, files))
  }

  return mergeDuplicatePeople(people)
}

function normalizePerson(
  person: PersonFolderAiPersonResult,
  idCard: NormalizedIdCard | null,
  files: ExtractedFileText[],
): PersonFolderExtractedPerson {
  const reviewReasons = new Set(person.review_reasons)
  const normalizedFiles = normalizePersonFiles(person.files, files)
  const certificates = normalizeCertificates(person.certificates)

  if (!person.person_name) {
    reviewReasons.add('人员姓名未知')
  }
  if (!idCard) {
    reviewReasons.add('未能用本地完整身份证号匹配该人员')
  }
  if (!person.education) {
    reviewReasons.add('学历未知')
  }
  if (certificates.length === 0) {
    reviewReasons.add('未识别到证书')
  }
  if (certificates.some((certificate) => !certificate.certificateName || !certificate.certificateSpecialty)) {
    reviewReasons.add('证书名称或证书专业不完整')
  }
  if (person.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    reviewReasons.add('人员汇总置信度低')
  }
  if (normalizedFiles.some((file) => file.relationType === 'uncertain')) {
    reviewReasons.add('存在文件归属不确定')
  }
  if (!idCard && person.person_name && normalizedFiles.length > 0) {
    reviewReasons.add('仅基于姓名或路径临时归并，需人工确认')
  }

  return {
    personName: person.person_name,
    idCardNumber: idCard?.idCardNumber ?? null,
    idCardMaskedDisplay: idCard?.maskedDisplay ?? person.masked_display,
    education: person.education,
    certificates,
    confidence: person.confidence,
    needsReview: person.needs_review || reviewReasons.size > 0,
    reviewReasons: [...reviewReasons],
    files: normalizedFiles,
  }
}

function normalizePersonFiles(
  relations: PersonFolderAiFileRelation[],
  files: ExtractedFileText[],
): PersonFolderPersonFile[] {
  const fileByRelativePath = new Map(files.map((file) => [file.file.relativePath, file.file]))
  const seen = new Set<string>()
  const result: PersonFolderPersonFile[] = []

  for (const relation of relations) {
    const file = fileByRelativePath.get(relation.relative_path)
    if (!file || seen.has(file.relativePath)) {
      continue
    }
    seen.add(file.relativePath)
    result.push({
      fileName: file.name,
      relativePath: file.relativePath,
      relationType: relation.relation_type,
      relationConfidence: relation.relation_confidence,
      evidence: relation.evidence,
    })
  }

  return result
}

function findLocalIdCardForAiPerson(
  person: PersonFolderAiPersonResult,
  files: ExtractedFileText[],
  allLocalIdCards: NormalizedIdCard[],
): NormalizedIdCard | null {
  if (allLocalIdCards.length === 1 && person.files.length > 0) {
    return allLocalIdCards[0]
  }

  const byMasked = person.masked_display
    ? allLocalIdCards.find((idCard) => idCard.maskedDisplay === person.masked_display)
    : null
  if (byMasked) {
    return byMasked
  }

  const byLast4 = person.id_card_last4
    ? allLocalIdCards.filter((idCard) => idCard.idCardLast4 === person.id_card_last4)
    : []
  if (byLast4.length === 1) {
    return byLast4[0]
  }

  const relatedPaths = new Set(person.files.map((file) => file.relative_path))
  const fromRelatedFiles = getUniqueIdCards(
    files
      .filter((file) => relatedPaths.has(file.file.relativePath))
      .flatMap((file) => file.idCards),
  )
  if (fromRelatedFiles.length === 1) {
    return fromRelatedFiles[0]
  }

  return null
}

function buildLocalPeople(files: ExtractedFileText[]): PersonFolderExtractedPerson[] {
  return getUniqueIdCards(files.flatMap((file) => file.idCards))
    .map((idCard) => createLocalPersonFromIdCard(idCard, files))
}

function createLocalPersonFromIdCard(
  idCard: NormalizedIdCard,
  files: ExtractedFileText[],
): PersonFolderExtractedPerson {
  const relatedFiles = files
    .filter((file) => file.idCards.some((fileIdCard) => fileIdCard.idCardHash === idCard.idCardHash))
    .map((file) => ({
      fileName: file.file.name,
      relativePath: file.file.relativePath,
      relationType: 'owner' as const,
      relationConfidence: 0.75,
      evidence: ['本地 OCR 识别到相同完整身份证号'],
    }))

  return {
    personName: null,
    idCardNumber: idCard.idCardNumber,
    idCardMaskedDisplay: idCard.maskedDisplay,
    education: null,
    certificates: [],
    confidence: 0.55,
    needsReview: true,
    reviewReasons: ['仅基于本地身份证号生成候选人员，需 AI 或人工补全'],
    files: relatedFiles,
  }
}

function mergeDuplicatePeople(people: PersonFolderExtractedPerson[]): PersonFolderExtractedPerson[] {
  const merged = new Map<string, PersonFolderExtractedPerson>()

  for (const person of people) {
    const key = person.idCardNumber
      ? `id:${person.idCardNumber}`
      : `name:${person.personName ?? randomUUID()}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, person)
      continue
    }

    existing.personName = existing.personName ?? person.personName
    existing.idCardMaskedDisplay = existing.idCardMaskedDisplay ?? person.idCardMaskedDisplay
    existing.education = existing.education ?? person.education
    existing.certificates = dedupeCertificates([...existing.certificates, ...person.certificates])
    existing.files = dedupePersonFiles([...existing.files, ...person.files])
    existing.confidence = Math.max(existing.confidence, person.confidence)
    existing.needsReview = existing.needsReview || person.needsReview
    existing.reviewReasons = [...new Set([...existing.reviewReasons, ...person.reviewReasons])]
  }

  return [...merged.values()]
}

function collectUnresolvedFiles(
  files: PersonFolderExtractedFile[],
  people: PersonFolderExtractedPerson[],
  aiUnresolvedFiles: string[] = [],
): PersonFolderExtractedFile[] {
  const relatedPaths = new Set(people.flatMap((person) => person.files.map((file) => file.relativePath)))
  const unresolvedByAi = new Set(aiUnresolvedFiles)

  return files.filter((file) => !relatedPaths.has(file.relativePath) || unresolvedByAi.has(file.relativePath))
}

function collectFolderReviewReasons(
  result: PersonFolderAiResult,
  people: PersonFolderExtractedPerson[],
  unresolvedFiles: PersonFolderExtractedFile[],
): string[] {
  const reasons = new Set(result.review_reasons.filter((item) => item.trim()))

  if (people.length === 0) {
    reasons.add('未识别到人员')
  }
  if (people.some((person) => person.needsReview)) {
    reasons.add('存在需要人工确认的人员')
  }
  if (unresolvedFiles.length > 0) {
    reasons.add('存在未归属文件')
  }
  if (result.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
    reasons.add('文件夹级整体置信度低')
  }

  return [...reasons]
}

function toResultFiles(files: ExtractedFileText[]): PersonFolderExtractedFile[] {
  return files.map((item) => ({
    fileName: item.file.name,
    relativePath: item.file.relativePath,
    originalPath: item.file.path,
    ext: item.file.ext,
    sizeBytes: item.file.sizeBytes,
    extractionStatus: item.status,
    confidence: item.confidence,
    error: item.error,
    textPreview: sanitizeIdCardsForAi(item.text).slice(0, TEXT_PREVIEW_CHARS),
  }))
}

function buildCombinedText(
  files: ExtractedFileText[],
  maxTextCharsPerFile: number,
  maxCombinedTextChars: number,
): string {
  const sections = files
    .map((item) => [
      `文件名：${sanitizeIdCardsForAi(item.file.name)}`,
      `相对路径：${sanitizeIdCardsForAi(item.file.relativePath)}`,
      `提取状态：${item.status}`,
      `本地识别身份证后四位：${item.idCards.map((idCard) => idCard.idCardLast4).join(', ') || '无'}`,
      '文本：',
      sanitizeIdCardsForAi(item.text).slice(0, maxTextCharsPerFile),
    ].join('\n'))
    .join('\n\n---\n\n')

  return sections.slice(0, maxCombinedTextChars)
}

function normalizeAiResult(value: unknown): PersonFolderAiResult {
  const record = asRecord(value)

  return {
    people: normalizeAiPeople(record.people),
    unresolved_files: asStringArray(record.unresolved_files),
    confidence: asConfidence(record.confidence),
    needs_review: Boolean(record.needs_review),
    review_reasons: asStringArray(record.review_reasons),
  }
}

function normalizeAiPeople(value: unknown): PersonFolderAiPersonResult[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = asRecord(item)
    return {
      person_name: nullableString(record.person_name),
      id_card_last4: normalizeLast4(record.id_card_last4),
      masked_display: nullableString(record.masked_display),
      education: nullableString(record.education),
      certificates: normalizeAiCertificates(record.certificates),
      confidence: asConfidence(record.confidence),
      needs_review: Boolean(record.needs_review),
      review_reasons: asStringArray(record.review_reasons),
      files: normalizeAiFileRelations(record.files),
    }
  })
}

function normalizeAiFileRelations(value: unknown): PersonFolderAiFileRelation[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.map((item) => {
    const record = asRecord(item)
    return {
      relative_path: nullableString(record.relative_path) ?? '',
      relation_type: normalizeRelationType(record.relation_type),
      relation_confidence: asConfidence(record.relation_confidence),
      evidence: asStringArray(record.evidence),
    }
  }).filter((item) => item.relative_path)
}

function normalizeAiCertificates(value: unknown): PersonFolderAiCertificateResult[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      const record = asRecord(item)
      return {
        certificate_name: nullableString(record.certificate_name),
        certificate_specialty: nullableString(record.certificate_specialty),
        confidence: nullableNumber(record.confidence),
        evidence: asStringArray(record.evidence),
      }
    })
    .filter((item) => item.certificate_name || item.certificate_specialty)
}

function normalizeCertificates(certificates: PersonFolderAiCertificateResult[]): PersonFolderCertificate[] {
  return dedupeCertificates(certificates.map((certificate) => ({
    certificateName: certificate.certificate_name,
    certificateSpecialty: certificate.certificate_specialty,
    displayName: buildCertificateDisplayName(certificate.certificate_name, certificate.certificate_specialty),
    confidence: certificate.confidence,
    evidence: certificate.evidence,
  })))
}

function buildCertificateDisplayName(name: string | null, specialty: string | null): string | null {
  if (name && specialty) {
    return `${name}/${specialty}`
  }

  return name ?? specialty
}

function dedupeCertificates(certificates: PersonFolderCertificate[]): PersonFolderCertificate[] {
  const seen = new Set<string>()
  return certificates.filter((certificate) => {
    const key = `${certificate.certificateName ?? ''}/${certificate.certificateSpecialty ?? ''}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function dedupePersonFiles(files: PersonFolderPersonFile[]): PersonFolderPersonFile[] {
  const byPath = new Map<string, PersonFolderPersonFile>()

  for (const file of files) {
    const existing = byPath.get(file.relativePath)
    if (!existing || existing.relationConfidence < file.relationConfidence) {
      byPath.set(file.relativePath, file)
    }
  }

  return [...byPath.values()]
}

function getUniqueIdCards(idCards: NormalizedIdCard[]): NormalizedIdCard[] {
  const seen = new Set<string>()
  return idCards.filter((idCard) => {
    if (seen.has(idCard.idCardHash)) {
      return false
    }
    seen.add(idCard.idCardHash)
    return true
  })
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

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback
  }

  const parsed = Math.trunc(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeRelationType(value: unknown): PersonFolderFileRelationType {
  return value === 'owner' || value === 'mentioned' || value === 'multi_person' || value === 'uncertain'
    ? value
    : 'uncertain'
}

function normalizeLast4(value: unknown): string | null {
  const normalized = nullableString(value)
  if (!normalized) {
    return null
  }

  const digits = normalized.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : normalized
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function nullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed || trimmed === 'unknown' || trimmed === 'null') {
    return null
  }

  return sanitizeIdCardsForAi(trimmed)
}

function nullableNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.min(Math.max(parsed, 0), 1)
}

function asConfidence(value: unknown): number {
  return nullableNumber(value) ?? 0
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => sanitizeIdCardsForAi(item.trim()))
    .filter(Boolean)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
