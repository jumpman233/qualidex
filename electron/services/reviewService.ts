import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { normalizeIdCardNumber } from './idCardService'

export interface ReviewItemSummary {
  id: string
  itemType: string | null
  refId: string | null
  reason: string | null
  status: string | null
  suggestedValue: string | null
  confirmedValue: string | null
  fileId: string | null
  fileName: string | null
  sourcePath: string | null
  processStatus: string | null
  ocrStatus: string | null
  ocrTextPreview: string | null
  aiStatus: string | null
  aiSummary: string | null
  personId: string | null
  personName: string | null
  idCardNumber: string | null
  primaryCategory: string | null
  region: string | null
  documentType: string | null
  licenseName: string | null
  licenseRecognitionStatus: string | null
  licenseNeedsReview: boolean
  createdAt: string | null
  updatedAt: string | null
}

export interface ReviewItemActionResult {
  reviewItem: ReviewItemSummary
  auditLogId: string
}

export interface ReviewFieldPatch {
  primaryCategory?: string | null
  region?: string | null
  documentType?: string | null
  licenseName?: string | null
  licenseRecognitionStatus?: string | null
}

export interface PersonCandidateSummary {
  id: string
  name: string | null
  idCardNumber: string | null
  idCardLast4: string | null
  maskedDisplay: string | null
  primaryCategory: string | null
  region: string | null
  reviewStatus: string | null
  documentCount: number
}

export interface CreatePersonFromReviewInput {
  name: string
  idCardNumber?: string | null
  idCardLast4?: string | null
  primaryCategory?: string | null
  region?: string | null
}

export interface MergePeopleInput {
  targetPersonId: string
  sourcePersonIds: string[]
  reason?: string | null
}

export interface MergePeopleResult {
  targetPerson: PersonCandidateSummary
  mergedSourcePersonIds: string[]
  movedDocumentCount: number
  movedLicenseCount: number
  auditLogId: string
}

interface ReviewItemRow {
  id: string
  item_type: string | null
  ref_id: string | null
  reason: string | null
  status: string | null
  suggested_value: string | null
  confirmed_value: string | null
  file_id: string | null
  file_name: string | null
  original_path: string | null
  process_status: string | null
  ocr_status: string | null
  ocr_text: string | null
  ai_status: string | null
  ai_result_json: string | null
  ai_error: string | null
  person_id: string | null
  person_name: string | null
  id_card_number: string | null
  person_primary_category: string | null
  person_region: string | null
  document_type: string | null
  document_target_category: string | null
  license_name: string | null
  license_primary_category: string | null
  license_region: string | null
  license_recognition_status: string | null
  license_needs_review: number | null
  created_at: string | null
  updated_at: string | null
}

interface ReviewItemActionRow {
  id: string
  item_type: string | null
  ref_id: string | null
  reason: string | null
  status: string | null
  suggested_value: string | null
  confirmed_value: string | null
}

interface ReviewFieldSnapshot {
  reviewItemId: string
  fileId: string | null
  personIds: string[]
  primaryCategories: Array<string | null>
  regions: Array<string | null>
  documentTypes: Array<string | null>
  licenseNames: Array<string | null>
  licenseRecognitionStatuses: Array<string | null>
}

interface PersonCandidateRow {
  id: string
  name: string | null
  id_card_number: string | null
  id_card_last4: string | null
  masked_display: string | null
  primary_category: string | null
  region: string | null
  review_status: string | null
  document_count: number
}

interface PersonReassignSnapshot {
  reviewItemId: string
  fileId: string
  personDocumentIds: string[]
  licenseIds: string[]
  oldPersonIds: string[]
  newPersonId: string
}

interface CreatePersonSnapshot extends PersonReassignSnapshot {
  createdPerson?: PersonCandidateSummary
}

interface MergePeopleSnapshot {
  targetPersonId: string
  sourcePersonIds: string[]
  documentIdsByPerson: Record<string, string[]>
  licenseIdsByPerson: Record<string, string[]>
}

export function listReviewItems(
  db: Database.Database,
  limit = 50,
): ReviewItemSummary[] {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 200) : 50
  const rows = db.prepare(`
    SELECT
      review_items.id,
      review_items.item_type,
      review_items.ref_id,
      review_items.reason,
      review_items.status,
      review_items.suggested_value,
      review_items.confirmed_value,
      files.id AS file_id,
      files.file_name,
      files.original_path,
      files.process_status,
      files.ocr_status,
      files.ocr_text,
      ai_latest.status AS ai_status,
      ai_latest.result_json AS ai_result_json,
      ai_latest.error AS ai_error,
      people.id AS person_id,
      people.name AS person_name,
      people.id_card_number,
      people.primary_category AS person_primary_category,
      people.region AS person_region,
      person_documents.document_type,
      person_documents.target_category AS document_target_category,
      GROUP_CONCAT(DISTINCT licenses.normalized_license_name) AS license_name,
      GROUP_CONCAT(DISTINCT licenses.primary_category) AS license_primary_category,
      GROUP_CONCAT(DISTINCT licenses.region) AS license_region,
      GROUP_CONCAT(DISTINCT licenses.recognition_status) AS license_recognition_status,
      MAX(COALESCE(licenses.needs_review, 0)) AS license_needs_review,
      review_items.created_at,
      review_items.updated_at
    FROM review_items
    LEFT JOIN files ON files.id = review_items.ref_id
    LEFT JOIN person_documents
      ON person_documents.file_id = files.id
      AND person_documents.status = 'active'
    LEFT JOIN people ON people.id = person_documents.person_id
    LEFT JOIN licenses
      ON licenses.file_id = files.id
      AND (licenses.person_id = people.id OR people.id IS NULL)
      AND licenses.status = 'active'
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
    WHERE COALESCE(review_items.status, 'pending') = 'pending'
      AND (files.id IS NULL OR (files.deleted_at IS NULL AND files.archive_status != 'deleted'))
    GROUP BY review_items.id
    ORDER BY review_items.created_at DESC, review_items.id DESC
    LIMIT @limit
  `).all({ limit: safeLimit }) as ReviewItemRow[]

  return rows.map(toReviewItemSummary)
}

export function confirmReviewItem(
  db: Database.Database,
  reviewItemId: string,
  confirmedValue?: string | null,
): ReviewItemActionResult {
  return updateReviewItemStatus(db, reviewItemId, 'confirmed', confirmedValue ?? null, '确认待确认项')
}

export function ignoreReviewItem(
  db: Database.Database,
  reviewItemId: string,
  reason?: string | null,
): ReviewItemActionResult {
  return updateReviewItemStatus(db, reviewItemId, 'ignored', reason ?? null, '忽略待确认项')
}

export function updateReviewFields(
  db: Database.Database,
  reviewItemId: string,
  patch: ReviewFieldPatch,
): ReviewItemActionResult {
  const existing = readReviewItemForAction(db, reviewItemId)

  if (!existing.ref_id) {
    throw new Error('待确认项未关联文件，无法修改字段。')
  }
  const fileId = existing.ref_id

  const normalizedPatch = normalizeReviewFieldPatch(patch)
  if (Object.keys(normalizedPatch).length === 0) {
    throw new Error('没有可保存的字段修改。')
  }

  const now = new Date().toISOString()
  const beforeValue = readReviewFieldSnapshot(db, reviewItemId, fileId)
  const auditLogId = randomUUID()

  const transaction = db.transaction(() => {
    applyReviewFieldPatch(db, fileId, normalizedPatch, now)
    markRelatedPeopleArchiveDirty(db, fileId, now)

    const afterValue = readReviewFieldSnapshot(db, reviewItemId, fileId)
    db.prepare(`
      INSERT INTO audit_logs (
        id,
        target_type,
        target_id,
        action,
        before_value,
        after_value,
        reason,
        created_at
      )
      VALUES (
        @id,
        'review_item',
        @targetId,
        '修改待确认字段',
        @beforeValue,
        @afterValue,
        @reason,
        @createdAt
      )
    `).run({
      id: auditLogId,
      targetId: reviewItemId,
      beforeValue: JSON.stringify(beforeValue),
      afterValue: JSON.stringify(afterValue),
      reason: JSON.stringify(normalizedPatch),
      createdAt: now,
    })
  })

  transaction()

  return {
    reviewItem: getReviewItemById(db, reviewItemId),
    auditLogId,
  }
}

export function listPersonCandidates(
  db: Database.Database,
  query = '',
  limit = 80,
): PersonCandidateSummary[] {
  const normalizedQuery = query.trim()
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.trunc(limit), 200) : 80
  const rows = db.prepare(`
    SELECT
      people.id,
      people.name,
      people.id_card_number,
      people.id_card_last4,
      people.masked_display,
      people.primary_category,
      people.region,
      people.review_status,
      COUNT(person_documents.id) AS document_count
    FROM people
    LEFT JOIN person_documents
      ON person_documents.person_id = people.id
      AND person_documents.status = 'active'
    WHERE people.status = 'active'
      AND people.deleted_at IS NULL
      AND (
        @query = ''
        OR people.name LIKE @likeQuery
        OR people.id_card_number LIKE @likeQuery
        OR people.id_card_last4 LIKE @likeQuery
        OR people.masked_display LIKE @likeQuery
        OR people.primary_category LIKE @likeQuery
        OR people.region LIKE @likeQuery
      )
    GROUP BY people.id
    ORDER BY people.updated_at DESC, people.created_at DESC, people.name
    LIMIT @limit
  `).all({
    query: normalizedQuery,
    likeQuery: `%${normalizedQuery}%`,
    limit: safeLimit,
  }) as PersonCandidateRow[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    idCardNumber: row.id_card_number,
    idCardLast4: row.id_card_last4,
    maskedDisplay: row.masked_display,
    primaryCategory: row.primary_category,
    region: row.region,
    reviewStatus: row.review_status,
    documentCount: row.document_count,
  }))
}

export function reassignReviewFilePerson(
  db: Database.Database,
  reviewItemId: string,
  personId: string,
): ReviewItemActionResult {
  const existing = readReviewItemForAction(db, reviewItemId)

  if (!existing.ref_id) {
    throw new Error('待确认项未关联文件，无法更换人员。')
  }

  const targetPerson = readPersonCandidateById(db, personId)
  const fileId = existing.ref_id
  const beforeValue = readPersonReassignSnapshot(db, reviewItemId, fileId, personId)
  const now = new Date().toISOString()
  const auditLogId = randomUUID()

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE person_documents
      SET
        person_id = @personId,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      personId,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE licenses
      SET
        person_id = @personId,
        primary_category = COALESCE(primary_category, @primaryCategory),
        region = COALESCE(region, @region),
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      personId,
      primaryCategory: targetPerson.primaryCategory,
      region: targetPerson.region,
      updatedAt: now,
    })

    markPeopleArchiveDirty(db, [...beforeValue.oldPersonIds, personId], now)

    const afterValue = readPersonReassignSnapshot(db, reviewItemId, fileId, personId)
    db.prepare(`
      INSERT INTO audit_logs (
        id,
        target_type,
        target_id,
        action,
        before_value,
        after_value,
        reason,
        created_at
      )
      VALUES (
        @id,
        'review_item',
        @targetId,
        '更换资料关联人员',
        @beforeValue,
        @afterValue,
        @reason,
        @createdAt
      )
    `).run({
      id: auditLogId,
      targetId: reviewItemId,
      beforeValue: JSON.stringify(beforeValue),
      afterValue: JSON.stringify(afterValue),
      reason: JSON.stringify({ personId }),
      createdAt: now,
    })
  })

  transaction()

  return {
    reviewItem: getReviewItemById(db, reviewItemId),
    auditLogId,
  }
}

export function createPersonFromReviewItem(
  db: Database.Database,
  reviewItemId: string,
  input: CreatePersonFromReviewInput,
): ReviewItemActionResult {
  const existing = readReviewItemForAction(db, reviewItemId)

  if (!existing.ref_id) {
    throw new Error('待确认项未关联文件，无法新建人员。')
  }

  const name = normalizeRequiredText(input.name, '人员姓名')
  const idCard = normalizeInputIdCardNumber(input.idCardNumber)
  const idCardLast4 = idCard?.idCardLast4 ?? normalizeIdCardLast4(input.idCardLast4)
  const primaryCategory = normalizeOptionalText(input.primaryCategory)
  const region = normalizeOptionalText(input.region)
  const fileId = existing.ref_id
  const personId = randomUUID()
  const now = new Date().toISOString()
  const beforeValue = readCreatePersonSnapshot(db, reviewItemId, fileId, personId)
  const auditLogId = randomUUID()

  const transaction = db.transaction(() => {
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
        'manual',
        1,
        @region,
        'manual',
        1,
        'confirmed',
        'active',
        1,
        @createdAt,
        @updatedAt
      )
    `).run({
      id: personId,
      name,
      idCardNumber: idCard?.idCardNumber ?? null,
      idCardLast4,
      idCardHash: idCard?.idCardHash ?? null,
      maskedDisplay: idCard?.maskedDisplay ?? null,
      primaryCategory,
      region,
      createdAt: now,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE person_documents
      SET
        person_id = @personId,
        target_category = COALESCE(target_category, @primaryCategory),
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      personId,
      primaryCategory,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE licenses
      SET
        person_id = @personId,
        primary_category = COALESCE(primary_category, @primaryCategory),
        region = COALESCE(region, @region),
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      personId,
      primaryCategory,
      region,
      updatedAt: now,
    })

    markPeopleArchiveDirty(db, [...beforeValue.oldPersonIds, personId], now)

    const afterValue = readCreatePersonSnapshot(db, reviewItemId, fileId, personId)
    db.prepare(`
      INSERT INTO audit_logs (
        id,
        target_type,
        target_id,
        action,
        before_value,
        after_value,
        reason,
        created_at
      )
      VALUES (
        @id,
        'review_item',
        @targetId,
        '从待确认项新建人员',
        @beforeValue,
        @afterValue,
        @reason,
        @createdAt
      )
    `).run({
      id: auditLogId,
      targetId: reviewItemId,
      beforeValue: JSON.stringify(beforeValue),
      afterValue: JSON.stringify(afterValue),
      reason: JSON.stringify({ name, idCardNumber: idCard?.idCardNumber ?? null, idCardLast4, primaryCategory, region }),
      createdAt: now,
    })
  })

  transaction()

  return {
    reviewItem: getReviewItemById(db, reviewItemId),
    auditLogId,
  }
}

export function mergePeople(
  db: Database.Database,
  input: MergePeopleInput,
): MergePeopleResult {
  const targetPersonId = normalizeRequiredText(input.targetPersonId, '保留人员')
  const sourcePersonIds = uniqueValues(input.sourcePersonIds.map((personId) => normalizeRequiredText(personId, '合并人员')))
    .filter((personId) => personId !== targetPersonId)

  if (sourcePersonIds.length === 0) {
    throw new Error('请选择至少一个不同于保留人员的合并人员。')
  }

  const targetPerson = readPersonCandidateById(db, targetPersonId)
  const sourcePeople = sourcePersonIds.map((personId) => readPersonCandidateById(db, personId))
  const now = new Date().toISOString()
  const beforeValue = readMergePeopleSnapshot(db, targetPersonId, sourcePersonIds)
  const auditLogId = randomUUID()
  let movedDocumentCount = 0
  let movedLicenseCount = 0

  const transaction = db.transaction(() => {
    const documentResult = db.prepare(`
      UPDATE person_documents
      SET
        person_id = @targetPersonId,
        updated_at = @updatedAt
      WHERE person_id = @sourcePersonId
        AND status = 'active'
    `)
    const licenseResult = db.prepare(`
      UPDATE licenses
      SET
        person_id = @targetPersonId,
        primary_category = COALESCE(primary_category, @targetPrimaryCategory),
        region = COALESCE(region, @targetRegion),
        updated_at = @updatedAt
      WHERE person_id = @sourcePersonId
        AND status = 'active'
    `)
    const softDeletePerson = db.prepare(`
      UPDATE people
      SET
        status = 'merged',
        archive_dirty = 1,
        deleted_at = @deletedAt,
        deleted_reason = @deletedReason,
        updated_at = @updatedAt
      WHERE id = @personId
    `)

    for (const sourcePerson of sourcePeople) {
      movedDocumentCount += documentResult.run({
        targetPersonId,
        sourcePersonId: sourcePerson.id,
        updatedAt: now,
      }).changes
      movedLicenseCount += licenseResult.run({
        targetPersonId,
        sourcePersonId: sourcePerson.id,
        targetPrimaryCategory: targetPerson.primaryCategory,
        targetRegion: targetPerson.region,
        updatedAt: now,
      }).changes
      softDeletePerson.run({
        personId: sourcePerson.id,
        deletedAt: now,
        deletedReason: `合并到人员 ${targetPersonId}`,
        updatedAt: now,
      })
    }

    markPeopleArchiveDirty(db, [targetPersonId, ...sourcePersonIds], now)

    const afterValue = readMergePeopleSnapshot(db, targetPersonId, sourcePersonIds)
    db.prepare(`
      INSERT INTO audit_logs (
        id,
        target_type,
        target_id,
        action,
        before_value,
        after_value,
        reason,
        created_at
      )
      VALUES (
        @id,
        'person',
        @targetId,
        '合并人员',
        @beforeValue,
        @afterValue,
        @reason,
        @createdAt
      )
    `).run({
      id: auditLogId,
      targetId: targetPersonId,
      beforeValue: JSON.stringify(beforeValue),
      afterValue: JSON.stringify(afterValue),
      reason: JSON.stringify({
        sourcePersonIds,
        note: normalizeOptionalText(input.reason),
      }),
      createdAt: now,
    })
  })

  transaction()

  return {
    targetPerson: readPersonCandidateById(db, targetPersonId),
    mergedSourcePersonIds: sourcePersonIds,
    movedDocumentCount,
    movedLicenseCount,
    auditLogId,
  }
}

function updateReviewItemStatus(
  db: Database.Database,
  reviewItemId: string,
  status: 'confirmed' | 'ignored',
  confirmedValue: string | null,
  action: string,
): ReviewItemActionResult {
  const existing = readReviewItemForAction(db, reviewItemId)

  if (existing.status && existing.status !== 'pending') {
    throw new Error('该待确认项已处理，请刷新列表。')
  }

  const now = new Date().toISOString()
  const afterValue = {
    ...existing,
    status,
    confirmed_value: confirmedValue,
  }
  const auditLogId = randomUUID()

  const transaction = db.transaction(() => {
    db.prepare(`
      UPDATE review_items
      SET
        status = @status,
        confirmed_value = @confirmedValue,
        updated_at = @updatedAt
      WHERE id = @id
    `).run({
      id: reviewItemId,
      status,
      confirmedValue,
      updatedAt: now,
    })

    markRelatedPeopleArchiveDirty(db, existing.ref_id, now)

    db.prepare(`
      INSERT INTO audit_logs (
        id,
        target_type,
        target_id,
        action,
        before_value,
        after_value,
        reason,
        created_at
      )
      VALUES (
        @id,
        'review_item',
        @targetId,
        @action,
        @beforeValue,
        @afterValue,
        @reason,
        @createdAt
      )
    `).run({
      id: auditLogId,
      targetId: reviewItemId,
      action,
      beforeValue: JSON.stringify(existing),
      afterValue: JSON.stringify(afterValue),
      reason: confirmedValue,
      createdAt: now,
    })
  })

  transaction()

  return {
    reviewItem: getReviewItemById(db, reviewItemId),
    auditLogId,
  }
}

function readReviewItemForAction(db: Database.Database, reviewItemId: string): ReviewItemActionRow {
  const row = db.prepare(`
    SELECT
      id,
      item_type,
      ref_id,
      reason,
      status,
      suggested_value,
      confirmed_value
    FROM review_items
    WHERE id = @reviewItemId
    LIMIT 1
  `).get({ reviewItemId }) as ReviewItemActionRow | undefined

  if (!row) {
    throw new Error('待确认项不存在。')
  }

  return row
}

function readPersonCandidateById(db: Database.Database, personId: string): PersonCandidateSummary {
  const row = db.prepare(`
    SELECT
      id,
      name,
      id_card_number,
      id_card_last4,
      masked_display,
      primary_category,
      region,
      review_status,
      0 AS document_count
    FROM people
    WHERE id = @personId
      AND status = 'active'
      AND deleted_at IS NULL
    LIMIT 1
  `).get({ personId }) as PersonCandidateRow | undefined

  if (!row) {
    throw new Error('目标人员不存在或已删除。')
  }

  return {
    id: row.id,
    name: row.name,
    idCardNumber: row.id_card_number,
    idCardLast4: row.id_card_last4,
    maskedDisplay: row.masked_display,
    primaryCategory: row.primary_category,
    region: row.region,
    reviewStatus: row.review_status,
    documentCount: row.document_count,
  }
}

function getReviewItemById(db: Database.Database, reviewItemId: string): ReviewItemSummary {
  const row = readReviewItemRowsById(db, reviewItemId)[0]

  if (!row) {
    throw new Error('待确认项不存在。')
  }

  return toReviewItemSummary(row)
}

function readReviewItemRowsById(db: Database.Database, reviewItemId: string): ReviewItemRow[] {
  return db.prepare(`
    SELECT
      review_items.id,
      review_items.item_type,
      review_items.ref_id,
      review_items.reason,
      review_items.status,
      review_items.suggested_value,
      review_items.confirmed_value,
      files.id AS file_id,
      files.file_name,
      files.original_path,
      files.process_status,
      files.ocr_status,
      files.ocr_text,
      ai_latest.status AS ai_status,
      ai_latest.result_json AS ai_result_json,
      ai_latest.error AS ai_error,
      people.id AS person_id,
      people.name AS person_name,
      people.id_card_number,
      people.primary_category AS person_primary_category,
      people.region AS person_region,
      person_documents.document_type,
      person_documents.target_category AS document_target_category,
      GROUP_CONCAT(DISTINCT licenses.normalized_license_name) AS license_name,
      GROUP_CONCAT(DISTINCT licenses.primary_category) AS license_primary_category,
      GROUP_CONCAT(DISTINCT licenses.region) AS license_region,
      GROUP_CONCAT(DISTINCT licenses.recognition_status) AS license_recognition_status,
      MAX(COALESCE(licenses.needs_review, 0)) AS license_needs_review,
      review_items.created_at,
      review_items.updated_at
    FROM review_items
    LEFT JOIN files ON files.id = review_items.ref_id
    LEFT JOIN person_documents
      ON person_documents.file_id = files.id
      AND person_documents.status = 'active'
    LEFT JOIN people ON people.id = person_documents.person_id
    LEFT JOIN licenses
      ON licenses.file_id = files.id
      AND (licenses.person_id = people.id OR people.id IS NULL)
      AND licenses.status = 'active'
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
    WHERE review_items.id = @reviewItemId
    GROUP BY review_items.id
    LIMIT 1
  `).all({ reviewItemId }) as ReviewItemRow[]
}

function markRelatedPeopleArchiveDirty(
  db: Database.Database,
  fileId: string | null,
  now: string,
): void {
  if (!fileId) {
    return
  }

  db.prepare(`
    UPDATE people
    SET
      archive_dirty = 1,
      updated_at = @updatedAt
    WHERE id IN (
      SELECT person_id
      FROM person_documents
      WHERE file_id = @fileId
        AND person_id IS NOT NULL
        AND status = 'active'
    )
  `).run({
    fileId,
    updatedAt: now,
  })
}

function markPeopleArchiveDirty(
  db: Database.Database,
  personIds: string[],
  now: string,
): void {
  const uniquePersonIds = [...new Set(personIds.filter(Boolean))]
  if (uniquePersonIds.length === 0) {
    return
  }

  const updatePerson = db.prepare(`
    UPDATE people
    SET
      archive_dirty = 1,
      updated_at = @updatedAt
    WHERE id = @personId
  `)

  for (const personId of uniquePersonIds) {
    updatePerson.run({ personId, updatedAt: now })
  }
}

function normalizeReviewFieldPatch(patch: ReviewFieldPatch): ReviewFieldPatch {
  const normalized: ReviewFieldPatch = {}

  if ('primaryCategory' in patch) {
    normalized.primaryCategory = normalizeOptionalText(patch.primaryCategory)
  }
  if ('region' in patch) {
    normalized.region = normalizeOptionalText(patch.region)
  }
  if ('documentType' in patch) {
    normalized.documentType = normalizeOptionalText(patch.documentType)
  }
  if ('licenseName' in patch) {
    normalized.licenseName = normalizeOptionalText(patch.licenseName)
  }
  if ('licenseRecognitionStatus' in patch) {
    normalized.licenseRecognitionStatus = normalizeRecognitionStatus(patch.licenseRecognitionStatus)
  }

  return normalized
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function normalizeRequiredText(value: string | null | undefined, label: string): string {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    throw new Error(`${label}不能为空。`)
  }

  return normalized
}

function normalizeIdCardLast4(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  if (!/^[0-9Xx]{4}$/.test(normalized)) {
    throw new Error('身份证后四位只能填写 4 位数字或 X。')
  }

  return normalized.toUpperCase()
}

function normalizeInputIdCardNumber(value: string | null | undefined) {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  const idCard = normalizeIdCardNumber(normalized)
  if (!idCard) {
    throw new Error('完整身份证号必须是 18 位大陆身份证号，末位可为 X。')
  }

  return idCard
}

function normalizeRecognitionStatus(value: string | null | undefined): string | null {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    return null
  }

  const allowedStatuses = new Set(['suggested', 'confirmed', 'pending_review', 'rejected'])
  if (!allowedStatuses.has(normalized)) {
    throw new Error('证书认可状态只能是 suggested、confirmed、pending_review 或 rejected。')
  }

  return normalized
}

function applyReviewFieldPatch(
  db: Database.Database,
  fileId: string,
  patch: ReviewFieldPatch,
  now: string,
): void {
  if ('primaryCategory' in patch) {
    db.prepare(`
      UPDATE person_documents
      SET
        target_category = @primaryCategory,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      primaryCategory: patch.primaryCategory,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE people
      SET
        primary_category = @primaryCategory,
        primary_category_source = 'manual',
        primary_category_confidence = 1,
        updated_at = @updatedAt
      WHERE id IN (
        SELECT person_id
        FROM person_documents
        WHERE file_id = @fileId
          AND person_id IS NOT NULL
          AND status = 'active'
      )
    `).run({
      fileId,
      primaryCategory: patch.primaryCategory,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE licenses
      SET
        primary_category = @primaryCategory,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      primaryCategory: patch.primaryCategory,
      updatedAt: now,
    })
  }

  if ('region' in patch) {
    db.prepare(`
      UPDATE people
      SET
        region = @region,
        region_source = 'manual',
        region_confidence = 1,
        updated_at = @updatedAt
      WHERE id IN (
        SELECT person_id
        FROM person_documents
        WHERE file_id = @fileId
          AND person_id IS NOT NULL
          AND status = 'active'
      )
    `).run({
      fileId,
      region: patch.region,
      updatedAt: now,
    })

    db.prepare(`
      UPDATE licenses
      SET
        region = @region,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      region: patch.region,
      updatedAt: now,
    })
  }

  if ('documentType' in patch) {
    db.prepare(`
      UPDATE person_documents
      SET
        document_type = @documentType,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      documentType: patch.documentType,
      updatedAt: now,
    })
  }

  if ('licenseName' in patch) {
    db.prepare(`
      UPDATE licenses
      SET
        normalized_license_name = @licenseName,
        raw_license_name = COALESCE(raw_license_name, @licenseName),
        license_search_text = @licenseSearchText,
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      licenseName: patch.licenseName,
      licenseSearchText: patch.licenseName,
      updatedAt: now,
    })
  }

  if ('licenseRecognitionStatus' in patch) {
    const needsReview = patch.licenseRecognitionStatus === 'confirmed' || patch.licenseRecognitionStatus === 'suggested'
      ? 0
      : 1
    const recognitionReason = patch.licenseRecognitionStatus === 'confirmed' || patch.licenseRecognitionStatus === 'suggested'
      ? null
      : '人工标记待确认'
    const issuerAuthorityReviewStatus = patch.licenseRecognitionStatus === 'confirmed'
      ? 'confirmed'
      : patch.licenseRecognitionStatus === 'rejected'
        ? 'rejected'
        : patch.licenseRecognitionStatus === 'pending_review'
          ? 'pending_review'
          : null

    db.prepare(`
      UPDATE licenses
      SET
        recognition_status = @recognitionStatus,
        needs_review = @needsReview,
        recognition_reason = @recognitionReason,
        issuer_authority_review_status = COALESCE(@issuerAuthorityReviewStatus, issuer_authority_review_status),
        updated_at = @updatedAt
      WHERE file_id = @fileId
        AND status = 'active'
    `).run({
      fileId,
      recognitionStatus: patch.licenseRecognitionStatus,
      needsReview,
      recognitionReason,
      issuerAuthorityReviewStatus,
      updatedAt: now,
    })
  }
}

function readReviewFieldSnapshot(
  db: Database.Database,
  reviewItemId: string,
  fileId: string,
): ReviewFieldSnapshot {
  const rows = db.prepare(`
    SELECT
      people.id AS person_id,
      people.primary_category AS person_primary_category,
      people.region AS person_region,
      person_documents.document_type,
      person_documents.target_category AS document_target_category,
      licenses.primary_category AS license_primary_category,
      licenses.region AS license_region,
      licenses.normalized_license_name AS license_name,
      licenses.recognition_status AS license_recognition_status
    FROM person_documents
    LEFT JOIN people ON people.id = person_documents.person_id
    LEFT JOIN licenses
      ON licenses.file_id = person_documents.file_id
      AND (licenses.person_id = people.id OR people.id IS NULL)
      AND licenses.status = 'active'
    WHERE person_documents.file_id = @fileId
      AND person_documents.status = 'active'
  `).all({ fileId }) as Array<{
    person_id: string | null
    person_primary_category: string | null
    person_region: string | null
    document_type: string | null
    document_target_category: string | null
    license_primary_category: string | null
    license_region: string | null
    license_name: string | null
    license_recognition_status: string | null
  }>

  return {
    reviewItemId,
    fileId,
    personIds: uniqueValues(rows.map((row) => row.person_id)),
    primaryCategories: uniqueNullableValues(rows.flatMap((row) => [
      row.person_primary_category,
      row.document_target_category,
      row.license_primary_category,
    ])),
    regions: uniqueNullableValues(rows.flatMap((row) => [
      row.person_region,
      row.license_region,
    ])),
    documentTypes: uniqueNullableValues(rows.map((row) => row.document_type)),
    licenseNames: uniqueNullableValues(rows.map((row) => row.license_name)),
    licenseRecognitionStatuses: uniqueNullableValues(rows.map((row) => row.license_recognition_status)),
  }
}

function readPersonReassignSnapshot(
  db: Database.Database,
  reviewItemId: string,
  fileId: string,
  newPersonId: string,
): PersonReassignSnapshot {
  const documentRows = db.prepare(`
    SELECT id, person_id
    FROM person_documents
    WHERE file_id = @fileId
      AND status = 'active'
  `).all({ fileId }) as Array<{ id: string, person_id: string | null }>
  const licenseRows = db.prepare(`
    SELECT id, person_id
    FROM licenses
    WHERE file_id = @fileId
      AND status = 'active'
  `).all({ fileId }) as Array<{ id: string, person_id: string | null }>

  return {
    reviewItemId,
    fileId,
    personDocumentIds: documentRows.map((row) => row.id),
    licenseIds: licenseRows.map((row) => row.id),
    oldPersonIds: uniqueValues([
      ...documentRows.map((row) => row.person_id),
      ...licenseRows.map((row) => row.person_id),
    ]),
    newPersonId,
  }
}

function readCreatePersonSnapshot(
  db: Database.Database,
  reviewItemId: string,
  fileId: string,
  newPersonId: string,
): CreatePersonSnapshot {
  const snapshot = readPersonReassignSnapshot(db, reviewItemId, fileId, newPersonId)
  const createdPerson = db.prepare(`
    SELECT
      people.id,
      people.name,
      people.id_card_number,
      people.id_card_last4,
      people.masked_display,
      people.primary_category,
      people.region,
      people.review_status,
      COUNT(person_documents.id) AS document_count
    FROM people
    LEFT JOIN person_documents
      ON person_documents.person_id = people.id
      AND person_documents.status = 'active'
    WHERE people.id = @personId
    GROUP BY people.id
    LIMIT 1
  `).get({ personId: newPersonId }) as PersonCandidateRow | undefined

  return {
    ...snapshot,
    createdPerson: createdPerson
      ? {
          id: createdPerson.id,
          name: createdPerson.name,
          idCardNumber: createdPerson.id_card_number,
          idCardLast4: createdPerson.id_card_last4,
          maskedDisplay: createdPerson.masked_display,
          primaryCategory: createdPerson.primary_category,
          region: createdPerson.region,
          reviewStatus: createdPerson.review_status,
          documentCount: createdPerson.document_count,
        }
      : undefined,
  }
}

function readMergePeopleSnapshot(
  db: Database.Database,
  targetPersonId: string,
  sourcePersonIds: string[],
): MergePeopleSnapshot {
  const personIds = [targetPersonId, ...sourcePersonIds]
  const documentIdsByPerson: Record<string, string[]> = {}
  const licenseIdsByPerson: Record<string, string[]> = {}
  const documentRows = db.prepare(`
    SELECT id, person_id
    FROM person_documents
    WHERE status = 'active'
  `).all() as Array<{ id: string, person_id: string | null }>
  const licenseRows = db.prepare(`
    SELECT id, person_id
    FROM licenses
    WHERE status = 'active'
  `).all() as Array<{ id: string, person_id: string | null }>

  for (const personId of personIds) {
    documentIdsByPerson[personId] = documentRows
      .filter((row) => row.person_id === personId)
      .map((row) => row.id)
    licenseIdsByPerson[personId] = licenseRows
      .filter((row) => row.person_id === personId)
      .map((row) => row.id)
  }

  return {
    targetPersonId,
    sourcePersonIds,
    documentIdsByPerson,
    licenseIdsByPerson,
  }
}

function uniqueValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
}

function uniqueNullableValues(values: Array<string | null>): Array<string | null> {
  return [...new Set(values)]
}

function toReviewItemSummary(row: ReviewItemRow): ReviewItemSummary {
  return {
    id: row.id,
    itemType: row.item_type,
    refId: row.ref_id,
    reason: row.reason,
    status: row.status,
    suggestedValue: row.suggested_value,
    confirmedValue: row.confirmed_value,
    fileId: row.file_id,
    fileName: row.file_name,
    sourcePath: row.original_path,
    processStatus: row.process_status,
    ocrStatus: row.ocr_status,
    ocrTextPreview: createPreview(row.ocr_text),
    aiStatus: row.ai_status,
    aiSummary: createAiSummary(row.ai_result_json, row.ai_error),
    personId: row.person_id,
    personName: row.person_name,
    idCardNumber: row.id_card_number,
    primaryCategory: row.document_target_category ?? row.license_primary_category ?? row.person_primary_category,
    region: row.license_region ?? row.person_region,
    documentType: row.document_type,
    licenseName: row.license_name,
    licenseRecognitionStatus: row.license_recognition_status,
    licenseNeedsReview: Boolean(row.license_needs_review),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createPreview(value: string | null, maxLength = 120): string | null {
  if (!value) {
    return null
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function createAiSummary(resultJson: string | null, error: string | null): string | null {
  if (error) {
    return error
  }

  if (!resultJson) {
    return null
  }

  try {
    const result = JSON.parse(resultJson) as {
      person?: { name?: string | null }
      category?: { primary_value?: string | null }
      region?: { value?: string | null }
      license?: { normalized_license_name?: string | null }
      licenses?: Array<{ normalized_license_name?: string | null }>
      confidence?: number | null
    }
    const licenseNames = uniqueValues([
      ...(result.licenses ?? []).map((license) => license.normalized_license_name ?? null),
      result.license?.normalized_license_name ?? null,
    ])
    const parts = [
      result.person?.name ? `人员：${result.person.name}` : null,
      result.category?.primary_value ? `类别：${result.category.primary_value}` : null,
      result.region?.value ? `地区：${result.region.value}` : null,
      licenseNames.length > 0 ? `证书：${licenseNames.join('、')}` : null,
      typeof result.confidence === 'number' ? `置信度：${Math.round(result.confidence * 100)}%` : null,
    ].filter(Boolean)

    return parts.length > 0 ? parts.join('；') : createPreview(resultJson)
  } catch {
    return createPreview(resultJson)
  }
}
