import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { AiExtractionInput, AiExtractionResult } from './aiExtractService'
import { extractIdCardNumbers, type NormalizedIdCard } from './idCardService'

export interface StructuredRecognitionPersistResult {
  personId: string | null
  personMatchStrategy: string
  personDocumentId: string | null
  licenseId: string | null
  reviewItemCount: number
}

interface PersonRow {
  id: string
  name: string | null
  id_card_number: string | null
  id_card_last4: string | null
  primary_category: string | null
  region: string | null
}

const CONFIDENCE_REVIEW_THRESHOLD = 0.8

export function persistStructuredRecognition(
  db: Database.Database,
  input: AiExtractionInput,
  result: AiExtractionResult,
  reviewReasons: string[],
): StructuredRecognitionPersistResult {
  const now = new Date().toISOString()
  const localIdCards = extractIdCardNumbers(input.ocrText)
  const localIdCard = localIdCards.length === 1 ? localIdCards[0] : null
  const personMatch = resolvePerson(db, result, localIdCard, now)

  updateFileMultiPersonFlag(db, input.fileId, result.multi_person.is_multi_person_file, now)

  const personDocumentId = personMatch.person
    ? upsertPersonDocument(db, input.fileId, personMatch.person.id, result, reviewReasons, now)
    : null
  const licenseId = personMatch.person && result.license.is_license_candidate
    ? insertLicense(db, input, result, personMatch.person.id, reviewReasons, now)
    : null

  const structuredReviewReasons = collectStructuredReviewReasons(result, personMatch.strategy, reviewReasons, localIdCards)
  persistStructuredReviewItems(db, input.fileId, structuredReviewReasons, result, now)

  return {
    personId: personMatch.person?.id ?? null,
    personMatchStrategy: personMatch.strategy,
    personDocumentId,
    licenseId,
    reviewItemCount: structuredReviewReasons.length,
  }
}

function resolvePerson(
  db: Database.Database,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
  now: string,
): { person: PersonRow | null, strategy: string } {
  const name = result.person.name?.trim() || null
  const idCardLast4 = localIdCard?.idCardLast4 ?? result.person.id_card_last4?.trim() ?? null
  const primaryCategory = result.category.primary_value?.trim() || null
  const region = result.region.value?.trim() || null

  if (!name) {
    return { person: null, strategy: 'person_unknown' }
  }

  if (localIdCard) {
    const existing = db.prepare(`
      SELECT id, name, id_card_number, id_card_last4, primary_category, region
      FROM people
      WHERE id_card_hash = @idCardHash
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `).get({ idCardHash: localIdCard.idCardHash }) as PersonRow | undefined

    if (existing) {
      if (existing.name && existing.name !== name) {
        updatePersonFromResult(db, existing.id, result, localIdCard, now, false)
        return { person: existing, strategy: 'id_card_name_conflict' }
      }

      updatePersonFromResult(db, existing.id, result, localIdCard, now, true)
      return { person: existing, strategy: 'id_card_hash' }
    }
  }

  if (idCardLast4) {
    const existing = db.prepare(`
      SELECT id, name, id_card_number, id_card_last4, primary_category, region
      FROM people
      WHERE name = @name
        AND id_card_last4 = @idCardLast4
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `).get({ name, idCardLast4 }) as PersonRow | undefined

    if (existing) {
      updatePersonFromResult(db, existing.id, result, localIdCard, now, true)
      return { person: existing, strategy: 'name_id_last4' }
    }
  }

  if (!idCardLast4 && primaryCategory && region) {
    const existing = db.prepare(`
      SELECT id, name, id_card_number, id_card_last4, primary_category, region
      FROM people
      WHERE name = @name
        AND primary_category = @primaryCategory
        AND region = @region
        AND status = 'active'
        AND deleted_at IS NULL
      LIMIT 1
    `).get({ name, primaryCategory, region }) as PersonRow | undefined

    if (existing) {
      updatePersonFromResult(db, existing.id, result, localIdCard, now, true)
      return { person: existing, strategy: 'name_category_region' }
    }
  }

  const sameNameRows = db.prepare(`
    SELECT id, name, id_card_number, id_card_last4, primary_category, region
    FROM people
    WHERE name = @name
      AND status = 'active'
      AND deleted_at IS NULL
  `).all({ name }) as PersonRow[]

  if (sameNameRows.length > 0 && localIdCard && sameNameRows.some((row) => row.id_card_number && row.id_card_number !== localIdCard.idCardNumber)) {
    return { person: createPerson(db, result, localIdCard, now, 'pending_review'), strategy: 'person_id_card_conflict' }
  }

  if (sameNameRows.length > 0 && (!idCardLast4 || sameNameRows.some((row) => row.id_card_last4 !== idCardLast4))) {
    return { person: createPerson(db, result, localIdCard, now, 'pending_review'), strategy: 'person_merge_conflict' }
  }

  return { person: createPerson(db, result, localIdCard, now, reviewStatusForResult(result)), strategy: 'created' }
}

function createPerson(
  db: Database.Database,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
  now: string,
  reviewStatus: string,
): PersonRow {
  const person: PersonRow = {
    id: randomUUID(),
    name: result.person.name,
    id_card_number: localIdCard?.idCardNumber ?? null,
    id_card_last4: localIdCard?.idCardLast4 ?? result.person.id_card_last4,
    primary_category: result.category.primary_value,
    region: result.region.value,
  }

  db.prepare(`
    INSERT INTO people (
      id,
      name,
      id_card_number,
      id_card_number_encrypted,
      id_card_last4,
      id_card_hash,
      masked_display,
      primary_category,
      primary_category_source,
      primary_category_confidence,
      region,
      region_source,
      region_confidence,
      education_level,
      education_school,
      education_major,
      review_status,
      status,
      archive_dirty,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @name,
      @idCardNumber,
      NULL,
      @idCardLast4,
      @idCardHash,
      @maskedDisplay,
      @primaryCategory,
      @primaryCategorySource,
      @primaryCategoryConfidence,
      @region,
      @regionSource,
      @regionConfidence,
      @educationLevel,
      @educationSchool,
      @educationMajor,
      @reviewStatus,
      'active',
      1,
      @createdAt,
      @updatedAt
    )
  `).run({
    id: person.id,
    name: person.name,
    idCardLast4: person.id_card_last4,
    idCardNumber: localIdCard?.idCardNumber ?? null,
    idCardHash: localIdCard?.idCardHash ?? null,
    maskedDisplay: localIdCard?.maskedDisplay ?? result.person.masked_display,
    primaryCategory: person.primary_category,
    primaryCategorySource: result.category.source,
    primaryCategoryConfidence: result.category.confidence,
    region: person.region,
    regionSource: result.region.source,
    regionConfidence: result.region.confidence,
    educationLevel: result.education.level,
    educationSchool: result.education.school,
    educationMajor: result.education.major,
    reviewStatus,
    createdAt: now,
    updatedAt: now,
  })

  return person
}

function updatePersonFromResult(
  db: Database.Database,
  personId: string,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
  now: string,
  allowNameFill: boolean,
): void {
  db.prepare(`
    UPDATE people
    SET
      name = CASE
        WHEN @allowNameFill = 1 THEN COALESCE(name, @name)
        ELSE name
      END,
      id_card_number = COALESCE(id_card_number, @idCardNumber),
      id_card_last4 = COALESCE(id_card_last4, @idCardLast4),
      id_card_hash = COALESCE(id_card_hash, @idCardHash),
      masked_display = COALESCE(masked_display, @maskedDisplay),
      primary_category = COALESCE(primary_category, @primaryCategory),
      primary_category_source = COALESCE(primary_category_source, @primaryCategorySource),
      primary_category_confidence = COALESCE(primary_category_confidence, @primaryCategoryConfidence),
      region = COALESCE(region, @region),
      region_source = COALESCE(region_source, @regionSource),
      region_confidence = COALESCE(region_confidence, @regionConfidence),
      education_level = COALESCE(education_level, @educationLevel),
      education_school = COALESCE(education_school, @educationSchool),
      education_major = COALESCE(education_major, @educationMajor),
      review_status = CASE
        WHEN review_status = 'pending_review' THEN review_status
        ELSE @reviewStatus
      END,
      archive_dirty = 1,
      updated_at = @updatedAt
    WHERE id = @personId
  `).run({
    personId,
    allowNameFill: allowNameFill ? 1 : 0,
    name: result.person.name,
    idCardNumber: localIdCard?.idCardNumber ?? null,
    idCardLast4: localIdCard?.idCardLast4 ?? result.person.id_card_last4,
    idCardHash: localIdCard?.idCardHash ?? null,
    maskedDisplay: localIdCard?.maskedDisplay ?? result.person.masked_display,
    primaryCategory: result.category.primary_value,
    primaryCategorySource: result.category.source,
    primaryCategoryConfidence: result.category.confidence,
    region: result.region.value,
    regionSource: result.region.source,
    regionConfidence: result.region.confidence,
    educationLevel: result.education.level,
    educationSchool: result.education.school,
    educationMajor: result.education.major,
    reviewStatus: reviewStatusForResult(result),
    updatedAt: now,
  })
}

function upsertPersonDocument(
  db: Database.Database,
  fileId: string,
  personId: string,
  result: AiExtractionResult,
  reviewReasons: string[],
  now: string,
): string {
  const existing = db.prepare(`
    SELECT id
    FROM person_documents
    WHERE file_id = @fileId
      AND person_id = @personId
      AND status = 'active'
    LIMIT 1
  `).get({ fileId, personId }) as { id: string } | undefined

  if (existing) {
    db.prepare(`
      UPDATE person_documents
      SET
        document_type = @documentType,
        target_category = @targetCategory,
        relation_type = @relationType,
        confidence = @confidence,
        needs_review = @needsReview,
        review_reason = @reviewReason,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: existing.id,
      documentType: result.document_type,
      targetCategory: result.category.primary_value,
      relationType: result.multi_person.is_multi_person_file ? 'multi_person' : 'primary',
      confidence: result.confidence,
      needsReview: reviewReasons.length > 0 ? 1 : 0,
      reviewReason: reviewReasons.join('；') || null,
      updatedAt: now,
    })

    return existing.id
  }

  const id = randomUUID()
  db.prepare(`
    INSERT INTO person_documents (
      id,
      person_id,
      file_id,
      document_type,
      target_category,
      relation_type,
      confidence,
      needs_review,
      review_reason,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @personId,
      @fileId,
      @documentType,
      @targetCategory,
      @relationType,
      @confidence,
      @needsReview,
      @reviewReason,
      'active',
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    personId,
    fileId,
    documentType: result.document_type,
    targetCategory: result.category.primary_value,
    relationType: result.multi_person.is_multi_person_file ? 'multi_person' : 'primary',
    confidence: result.confidence,
    needsReview: reviewReasons.length > 0 ? 1 : 0,
    reviewReason: reviewReasons.join('；') || null,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

function insertLicense(
  db: Database.Database,
  input: AiExtractionInput,
  result: AiExtractionResult,
  personId: string,
  reviewReasons: string[],
  now: string,
): string {
  const id = randomUUID()
  const needsReview = reviewReasons.length > 0 || result.confidence < CONFIDENCE_REVIEW_THRESHOLD
  const searchText = [
    result.license.raw_license_name,
    result.license.normalized_license_name,
    result.license.license_category,
    result.license.issuing_authority,
  ].filter(Boolean).join(' ')

  db.prepare(`
    INSERT INTO licenses (
      id,
      person_id,
      file_id,
      primary_category,
      detected_categories,
      region,
      raw_license_name,
      normalized_license_name,
      license_category,
      issuing_authority,
      valid_until,
      recognition_status,
      recognition_reason,
      issuer_authority_level,
      issuer_authority_score,
      issuer_authority_source,
      issuer_authority_reason,
      issuer_authority_review_status,
      confidence,
      needs_review,
      ocr_text,
      extracted_evidence,
      license_search_text,
      status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @personId,
      @fileId,
      @primaryCategory,
      @detectedCategories,
      @region,
      @rawLicenseName,
      @normalizedLicenseName,
      @licenseCategory,
      @issuingAuthority,
      @validUntil,
      @recognitionStatus,
      @recognitionReason,
      'unknown',
      NULL,
      'unknown',
      NULL,
      @issuerAuthorityReviewStatus,
      @confidence,
      @needsReview,
      @ocrText,
      @extractedEvidence,
      @licenseSearchText,
      'active',
      @createdAt,
      @updatedAt
    )
  `).run({
    id,
    personId,
    fileId: input.fileId,
    primaryCategory: result.category.primary_value,
    detectedCategories: JSON.stringify(result.category.candidate_values),
    region: result.region.value,
    rawLicenseName: result.license.raw_license_name,
    normalizedLicenseName: result.license.normalized_license_name,
    licenseCategory: result.license.license_category,
    issuingAuthority: result.license.issuing_authority,
    validUntil: result.license.valid_until,
    recognitionStatus: needsReview ? 'pending_review' : 'suggested',
    recognitionReason: needsReview ? reviewReasons.join('；') || '低置信度，需要人工确认' : null,
    issuerAuthorityReviewStatus: needsReview ? 'pending_review' : 'confirmed',
    confidence: result.confidence,
    needsReview: needsReview ? 1 : 0,
    ocrText: input.ocrText,
    extractedEvidence: JSON.stringify(result.evidence),
    licenseSearchText: searchText,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

function collectStructuredReviewReasons(
  result: AiExtractionResult,
  personMatchStrategy: string,
  reviewReasons: string[],
  localIdCards: NormalizedIdCard[],
): string[] {
  const reasons = new Set<string>()

  if (personMatchStrategy === 'person_unknown') {
    reasons.add('人员姓名未知')
  }
  if (personMatchStrategy === 'person_merge_conflict') {
    reasons.add('存在同名人员归并冲突')
  }
  if (personMatchStrategy === 'person_id_card_conflict') {
    reasons.add('同名人员存在不同完整身份证号')
  }
  if (personMatchStrategy === 'id_card_name_conflict') {
    reasons.add('完整身份证号一致但姓名不一致')
  }
  if (localIdCards.length > 1) {
    reasons.add('同一文件出现多个完整身份证号')
  }
  if (result.license.is_license_candidate && result.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    reasons.add('证书识别置信度低')
  }
  if (result.license.is_license_candidate && !result.license.normalized_license_name) {
    reasons.add('证书名称未知')
  }

  for (const reason of reviewReasons) {
    reasons.add(reason)
  }

  return [...reasons]
}

function persistStructuredReviewItems(
  db: Database.Database,
  fileId: string,
  reasons: string[],
  result: AiExtractionResult,
  now: string,
): void {
  const existingReasons = new Set(
    (db.prepare(`
      SELECT reason
      FROM review_items
      WHERE ref_id = @fileId
        AND status = 'pending'
    `).all({ fileId }) as Array<{ reason: string | null }>)
      .map((row) => row.reason)
      .filter((reason): reason is string => Boolean(reason)),
  )

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
      'pending',
      @suggestedValue,
      NULL,
      @createdAt,
      @updatedAt
    )
  `)

  for (const reason of reasons) {
    if (existingReasons.has(reason)) {
      continue
    }

    insertReview.run({
      id: randomUUID(),
      itemType: toReviewItemType(reason),
      refId: fileId,
      reason,
      suggestedValue: JSON.stringify(result),
      createdAt: now,
      updatedAt: now,
    })
  }
}

function updateFileMultiPersonFlag(
  db: Database.Database,
  fileId: string,
  isMultiPersonFile: boolean,
  now: string,
): void {
  db.prepare(`
    UPDATE files
    SET
      is_multi_person_file = @isMultiPersonFile,
      updated_at = @updatedAt
    WHERE id = @fileId
  `).run({
    fileId,
    isMultiPersonFile: isMultiPersonFile ? 1 : 0,
    updatedAt: now,
  })
}

function reviewStatusForResult(result: AiExtractionResult): string {
  return result.needs_manual_review || result.confidence < CONFIDENCE_REVIEW_THRESHOLD
    ? 'pending_review'
    : 'suggested'
}

function toReviewItemType(reason: string): string {
  if (reason.includes('归并冲突') || reason.includes('身份证号')) {
    return 'person_merge_conflict'
  }
  if (reason.includes('人员')) {
    return 'person_unknown'
  }
  if (reason.includes('类别')) {
    return 'primary_category_unknown'
  }
  if (reason.includes('地区')) {
    return 'region_unknown'
  }
  if (reason.includes('证书')) {
    return 'license_recognition_uncertain'
  }
  if (reason.includes('多人')) {
    return 'multi_person_file'
  }
  return 'ai_uncertain'
}
