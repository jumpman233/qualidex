import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { AiExtractionInput, AiExtractionResult, AiLicenseResult } from './aiExtractService'
import { extractIdCardNumbers, type NormalizedIdCard } from './idCardService'

export interface StructuredRecognitionPersistResult {
  personId: string | null
  personMatchStrategy: string
  personDocumentId: string | null
  licenseId: string | null
  licenseIds: string[]
  reviewItemCount: number
}

interface PersonRow {
  id: string
  name: string | null
  id_card_number: string | null
  id_card_hash?: string | null
  id_card_last4: string | null
  primary_category: string | null
  region: string | null
}

interface FolderFileRow {
  id: string
  file_name: string | null
  source_batch_id: string | null
  source_root_path: string | null
  parent_folder: string | null
  relative_path: string | null
  ocr_text: string | null
  ai_result_json: string | null
  person_id: string | null
  person_name: string | null
  id_card_number: string | null
  id_card_hash: string | null
  id_card_last4: string | null
  primary_category: string | null
  region: string | null
}

interface FolderMergeContext {
  key: string | null
  anchorPerson: PersonRow | null
  reviewReasons: string[]
  confidence: number | null
  resultJson: string | null
}

interface MultiPersonCandidate {
  name: string | null
  idCardLast4: string | null
  maskedDisplay: string | null
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
  const folderMergeContext = analyzeFolderMergeContext(db, input.fileId, result, localIdCards)
  const personMatch = resolvePerson(db, result, localIdCard, folderMergeContext.anchorPerson, now)

  updateFileMultiPersonFlag(db, input.fileId, result.multi_person.is_multi_person_file, now)

  const personDocumentId = personMatch.person
    ? upsertPersonDocument(db, input.fileId, personMatch.person.id, result, reviewReasons, now)
    : null
  const licenseIds = personMatch.person
    ? insertLicenses(db, input, result, personMatch.person.id, reviewReasons, now)
    : []
  upsertMultiPersonAssociations(db, input.fileId, result, personMatch.person, localIdCards, reviewReasons, now)

  recordFolderMergeContext(db, input.fileId, folderMergeContext, now)

  const structuredReviewReasons = collectStructuredReviewReasons(
    result,
    personMatch.strategy,
    reviewReasons,
    localIdCards,
    folderMergeContext.reviewReasons,
  )
  persistStructuredReviewItems(db, input.fileId, structuredReviewReasons, result, now)

  return {
    personId: personMatch.person?.id ?? null,
    personMatchStrategy: personMatch.strategy,
    personDocumentId,
    licenseId: licenseIds[0] ?? null,
    licenseIds,
    reviewItemCount: structuredReviewReasons.length,
  }
}

function resolvePerson(
  db: Database.Database,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
  folderAnchorPerson: PersonRow | null,
  now: string,
): { person: PersonRow | null, strategy: string } {
  const name = result.person.name?.trim() || null
  const idCardLast4 = localIdCard?.idCardLast4 ?? result.person.id_card_last4?.trim() ?? null
  const primaryCategory = result.category.primary_value?.trim() || null
  const region = result.region.value?.trim() || null

  if (!localIdCard && folderAnchorPerson && isFolderAnchorCompatible(name, folderAnchorPerson)) {
    updatePersonFromResult(db, folderAnchorPerson.id, result, null, now, true)
    return { person: folderAnchorPerson, strategy: 'folder_single_id_card' }
  }

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

function upsertMultiPersonAssociations(
  db: Database.Database,
  fileId: string,
  result: AiExtractionResult,
  primaryPerson: PersonRow | null,
  localIdCards: NormalizedIdCard[],
  reviewReasons: string[],
  now: string,
): void {
  if (!result.multi_person.is_multi_person_file) {
    return
  }

  const candidates = collectMultiPersonCandidates(result)
  for (const candidate of candidates) {
    const localIdCard = findLocalIdCardForCandidate(candidate, localIdCards)
    const candidateResult = createCandidateResult(result, candidate)
    const person = resolveMultiPersonCandidate(db, candidateResult, localIdCard, primaryPerson, now)

    if (!person) {
      continue
    }

    upsertPersonDocument(db, fileId, person.id, candidateResult, reviewReasons, now)
  }
}

function collectMultiPersonCandidates(result: AiExtractionResult): MultiPersonCandidate[] {
  const candidates: MultiPersonCandidate[] = []
  const addCandidate = (candidate: MultiPersonCandidate) => {
    const key = [
      candidate.name ?? '',
      candidate.idCardLast4 ?? '',
      candidate.maskedDisplay ?? '',
    ].join('|')
    if (!key.replace(/\|/g, '').trim()) {
      return
    }
    if (!candidates.some((existing) => [
      existing.name ?? '',
      existing.idCardLast4 ?? '',
      existing.maskedDisplay ?? '',
    ].join('|') === key)) {
      candidates.push(candidate)
    }
  }

  addCandidate({
    name: result.person.name,
    idCardLast4: result.person.id_card_last4,
    maskedDisplay: result.person.masked_display,
  })
  for (const person of result.multi_person.detected_people) {
    addCandidate({
      name: person.name,
      idCardLast4: person.id_card_last4,
      maskedDisplay: person.masked_display,
    })
  }

  return candidates
}

function findLocalIdCardForCandidate(
  candidate: MultiPersonCandidate,
  localIdCards: NormalizedIdCard[],
): NormalizedIdCard | null {
  if (!candidate.idCardLast4) {
    return null
  }

  const matches = localIdCards.filter((idCard) => idCard.idCardLast4 === candidate.idCardLast4)
  return matches.length === 1 ? matches[0] : null
}

function createCandidateResult(
  result: AiExtractionResult,
  candidate: MultiPersonCandidate,
): AiExtractionResult {
  return {
    ...result,
    person: {
      name: candidate.name,
      id_card_last4: candidate.idCardLast4,
      masked_display: candidate.maskedDisplay,
    },
  }
}

function resolveMultiPersonCandidate(
  db: Database.Database,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
  primaryPerson: PersonRow | null,
  now: string,
): PersonRow | null {
  if (primaryPerson && isSameCandidatePerson(primaryPerson, result, localIdCard)) {
    return primaryPerson
  }

  const resolved = resolvePerson(db, result, localIdCard, null, now)
  if (resolved.person) {
    return resolved.person
  }

  if (!result.person.name && !localIdCard) {
    return null
  }

  return createPerson(db, result, localIdCard, now, 'pending_review')
}

function isSameCandidatePerson(
  person: PersonRow,
  result: AiExtractionResult,
  localIdCard: NormalizedIdCard | null,
): boolean {
  if (localIdCard && person.id_card_number === localIdCard.idCardNumber) {
    return true
  }

  const name = result.person.name?.trim() || null
  const last4 = localIdCard?.idCardLast4 ?? result.person.id_card_last4
  return Boolean(name && person.name === name && (!last4 || person.id_card_last4 === last4))
}

function isFolderAnchorCompatible(name: string | null, anchorPerson: PersonRow): boolean {
  return !name || !anchorPerson.name || name === anchorPerson.name
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

function insertLicenses(
  db: Database.Database,
  input: AiExtractionInput,
  result: AiExtractionResult,
  personId: string,
  reviewReasons: string[],
  now: string,
): string[] {
  const licenseCandidates = getCandidateLicenses(result)
  const insertedIds: string[] = []

  for (const license of licenseCandidates) {
    insertedIds.push(insertLicense(db, input, result, license, personId, reviewReasons, now))
  }

  return insertedIds
}

function getCandidateLicenses(result: AiExtractionResult): AiLicenseResult[] {
  const candidates = result.licenses.length > 0
    ? result.licenses
    : [result.license]

  return candidates.filter((license) => license.is_license_candidate)
}

function insertLicense(
  db: Database.Database,
  input: AiExtractionInput,
  result: AiExtractionResult,
  license: AiLicenseResult,
  personId: string,
  reviewReasons: string[],
  now: string,
): string {
  const id = randomUUID()
  const needsReview = reviewReasons.length > 0 || result.confidence < CONFIDENCE_REVIEW_THRESHOLD
  const searchText = [
    license.raw_license_name,
    license.normalized_license_name,
    license.license_category,
    license.issuing_authority,
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
    rawLicenseName: license.raw_license_name,
    normalizedLicenseName: license.normalized_license_name,
    licenseCategory: license.license_category,
    issuingAuthority: license.issuing_authority,
    validUntil: license.valid_until,
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

function analyzeFolderMergeContext(
  db: Database.Database,
  fileId: string,
  result: AiExtractionResult,
  localIdCards: NormalizedIdCard[],
): FolderMergeContext {
  const currentFile = readFolderFile(db, fileId)
  if (!currentFile) {
    return createEmptyFolderMergeContext()
  }
  if (!currentFile.source_batch_id && !currentFile.source_root_path) {
    return createEmptyFolderMergeContext()
  }

  const folderRows = readFolderFiles(db, currentFile)
  const idCardsByHash = new Map<string, {
    idCardLast4: string
    maskedDisplay: string
    fileIds: Set<string>
    personIds: Set<string>
  }>()
  const names = new Set<string>()
  const personRowsById = new Map<string, PersonRow>()

  for (const row of folderRows) {
    for (const idCard of extractIdCardNumbers(row.ocr_text ?? '')) {
      addFolderIdCard(idCardsByHash, idCard, row.id, row.person_id)
    }

    if (row.id_card_hash && row.id_card_last4) {
      addFolderIdCardByParts(idCardsByHash, row.id_card_hash, row.id_card_last4, row.id, row.person_id)
    }
    if (row.person_id) {
      personRowsById.set(row.person_id, {
        id: row.person_id,
        name: row.person_name,
        id_card_number: row.id_card_number,
        id_card_hash: row.id_card_hash,
        id_card_last4: row.id_card_last4,
        primary_category: row.primary_category,
        region: row.region,
      })
    }

    collectNamesFromAiResult(names, row.ai_result_json)
    addName(names, row.person_name)
  }

  for (const idCard of localIdCards) {
    addFolderIdCard(idCardsByHash, idCard, fileId, null)
  }
  collectNamesFromResult(names, result)

  const reviewReasons: string[] = []
  if (idCardsByHash.size > 1) {
    reviewReasons.push('同一文件夹出现多个完整身份证号')
  }
  if (names.size > 1) {
    reviewReasons.push('同一文件夹出现多个人名')
  }

  const anchorPerson = resolveFolderAnchorPerson(idCardsByHash, personRowsById)
  const confidence = reviewReasons.length > 0
    ? 0.3
    : anchorPerson
      ? 0.86
      : folderRows.length > 1
        ? 0.5
        : null
  const key = buildFolderMergeKey(currentFile)
  const resultJson = JSON.stringify({
    folder_merge_key: key,
    parent_folder: currentFile.parent_folder,
    source_batch_id: currentFile.source_batch_id,
    source_root_path: currentFile.source_root_path,
    file_ids: uniqueStrings(folderRows.map((row) => row.id)),
    candidate_person_ids: uniqueStrings(folderRows.map((row) => row.person_id)),
    id_card_last4_values: [...idCardsByHash.values()].map((item) => item.idCardLast4),
    names: [...names],
    anchor_person_id: anchorPerson?.id ?? null,
    review_reasons: reviewReasons,
  })

  return {
    key,
    anchorPerson,
    reviewReasons,
    confidence,
    resultJson,
  }
}

function readFolderFile(db: Database.Database, fileId: string): FolderFileRow | null {
  const row = db.prepare(`
    SELECT
      files.id,
      files.file_name,
      files.source_batch_id,
      files.source_root_path,
      files.parent_folder,
      files.relative_path,
      files.ocr_text,
      NULL AS ai_result_json,
      NULL AS person_id,
      NULL AS person_name,
      NULL AS id_card_number,
      NULL AS id_card_hash,
      NULL AS id_card_last4,
      NULL AS primary_category,
      NULL AS region
    FROM files
    WHERE files.id = @fileId
    LIMIT 1
  `).get({ fileId }) as FolderFileRow | undefined

  return row ?? null
}

function readFolderFiles(db: Database.Database, currentFile: FolderFileRow): FolderFileRow[] {
  return db.prepare(`
    SELECT
      files.id,
      files.file_name,
      files.source_batch_id,
      files.source_root_path,
      files.parent_folder,
      files.relative_path,
      files.ocr_text,
      ai_latest.result_json AS ai_result_json,
      people.id AS person_id,
      people.name AS person_name,
      people.id_card_number,
      people.id_card_hash,
      people.id_card_last4,
      people.primary_category,
      people.region
    FROM files
    LEFT JOIN person_documents
      ON person_documents.file_id = files.id
      AND person_documents.status = 'active'
    LEFT JOIN people
      ON people.id = person_documents.person_id
      AND people.status = 'active'
      AND people.deleted_at IS NULL
    LEFT JOIN (
      SELECT ai_extract_results.*
      FROM ai_extract_results
      INNER JOIN (
        SELECT file_id, MAX(created_at) AS created_at
        FROM ai_extract_results
        GROUP BY file_id
      ) latest
        ON latest.file_id = ai_extract_results.file_id
        AND latest.created_at = ai_extract_results.created_at
    ) ai_latest ON ai_latest.file_id = files.id
    WHERE COALESCE(files.source_batch_id, '') = COALESCE(@sourceBatchId, '')
      AND COALESCE(files.source_root_path, '') = COALESCE(@sourceRootPath, '')
      AND COALESCE(files.parent_folder, '') = COALESCE(@parentFolder, '')
      AND files.deleted_at IS NULL
  `).all({
    sourceBatchId: currentFile.source_batch_id,
    sourceRootPath: currentFile.source_root_path,
    parentFolder: currentFile.parent_folder,
  }) as FolderFileRow[]
}

function addFolderIdCard(
  map: Map<string, { idCardLast4: string, maskedDisplay: string, fileIds: Set<string>, personIds: Set<string> }>,
  idCard: NormalizedIdCard,
  fileId: string,
  personId: string | null,
): void {
  addFolderIdCardByParts(map, idCard.idCardHash, idCard.idCardLast4, fileId, personId, idCard.maskedDisplay)
}

function addFolderIdCardByParts(
  map: Map<string, { idCardLast4: string, maskedDisplay: string, fileIds: Set<string>, personIds: Set<string> }>,
  idCardHash: string,
  idCardLast4: string,
  fileId: string,
  personId: string | null,
  maskedDisplay = '',
): void {
  const existing = map.get(idCardHash) ?? {
    idCardLast4,
    maskedDisplay,
    fileIds: new Set<string>(),
    personIds: new Set<string>(),
  }

  existing.fileIds.add(fileId)
  if (personId) {
    existing.personIds.add(personId)
  }
  map.set(idCardHash, existing)
}

function resolveFolderAnchorPerson(
  idCardsByHash: Map<string, { personIds: Set<string> }>,
  personRowsById: Map<string, PersonRow>,
): PersonRow | null {
  const idCardHashes = new Set(idCardsByHash.keys())
  const matchedPeople = [...personRowsById.values()].filter((person) => {
    return person.id_card_hash ? idCardHashes.has(person.id_card_hash) : false
  })
  const uniqueMatchedPeople = new Map(matchedPeople.map((person) => [person.id, person]))

  return uniqueMatchedPeople.size === 1
    ? [...uniqueMatchedPeople.values()][0]
    : null
}

function collectNamesFromAiResult(names: Set<string>, resultJson: string | null): void {
  if (!resultJson) {
    return
  }

  try {
    collectNamesFromResult(names, JSON.parse(resultJson) as AiExtractionResult)
  } catch {
    return
  }
}

function collectNamesFromResult(names: Set<string>, result: AiExtractionResult): void {
  addName(names, result.person.name)
  for (const person of result.multi_person.detected_people) {
    addName(names, person.name)
  }
}

function addName(names: Set<string>, value: string | null | undefined): void {
  const normalized = value?.trim()
  if (normalized) {
    names.add(normalized)
  }
}

function recordFolderMergeContext(
  db: Database.Database,
  fileId: string,
  context: FolderMergeContext,
  now: string,
): void {
  if (!context.key) {
    return
  }

  const currentFile = readFolderFile(db, fileId)
  if (!currentFile) {
    return
  }

  db.prepare(`
    UPDATE files
    SET
      folder_merge_key = @folderMergeKey,
      folder_merge_result = @folderMergeResult,
      folder_merge_confidence = @folderMergeConfidence,
      updated_at = @updatedAt
    WHERE COALESCE(source_batch_id, '') = COALESCE(@sourceBatchId, '')
      AND COALESCE(source_root_path, '') = COALESCE(@sourceRootPath, '')
      AND COALESCE(parent_folder, '') = COALESCE(@parentFolder, '')
      AND deleted_at IS NULL
  `).run({
    folderMergeKey: context.key,
    folderMergeResult: context.resultJson,
    folderMergeConfidence: context.confidence,
    updatedAt: now,
    sourceBatchId: currentFile.source_batch_id,
    sourceRootPath: currentFile.source_root_path,
    parentFolder: currentFile.parent_folder,
  })
}

function createEmptyFolderMergeContext(): FolderMergeContext {
  return {
    key: null,
    anchorPerson: null,
    reviewReasons: [],
    confidence: null,
    resultJson: null,
  }
}

function buildFolderMergeKey(file: FolderFileRow): string {
  return JSON.stringify({
    batchId: file.source_batch_id,
    sourceRootPath: file.source_root_path,
    parentFolder: file.parent_folder,
  })
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function collectStructuredReviewReasons(
  result: AiExtractionResult,
  personMatchStrategy: string,
  reviewReasons: string[],
  localIdCards: NormalizedIdCard[],
  folderMergeReviewReasons: string[],
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
  const licenseCandidates = getCandidateLicenses(result)
  if (licenseCandidates.length > 0 && result.confidence < CONFIDENCE_REVIEW_THRESHOLD) {
    reasons.add('证书识别置信度低')
  }
  if (licenseCandidates.some((license) => !license.normalized_license_name)) {
    reasons.add('证书名称未知')
  }

  for (const reason of reviewReasons) {
    reasons.add(reason)
  }
  for (const reason of folderMergeReviewReasons) {
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
