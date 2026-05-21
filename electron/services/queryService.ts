import type Database from 'better-sqlite3'

export interface QueryPeopleConditions {
  categories?: string[]
  region?: string | null
  educationMin?: string | null
  licenseQuery?: string | null
  includePendingReview?: boolean
  limit?: number
}

export interface QueryPersonResult {
  personId: string
  name: string | null
  idCardNumber: string | null
  idCardLast4: string | null
  maskedDisplay: string | null
  primaryCategory: string | null
  region: string | null
  educationLevel: string | null
  licenseNames: string[]
  documentCount: number
  matchReason: string
}

interface QueryPersonRow {
  person_id: string
  name: string | null
  id_card_number: string | null
  id_card_last4: string | null
  masked_display: string | null
  primary_category: string | null
  region: string | null
  education_level: string | null
  license_names: string | null
  document_count: number
}

const EDUCATION_RANKS: Record<string, number> = {
  high_school: 1,
  secondary: 2,
  college: 3,
  bachelor: 4,
  master: 5,
  doctor: 6,
}

export function queryPeople(
  db: Database.Database,
  conditions: QueryPeopleConditions = {},
): QueryPersonResult[] {
  const normalized = normalizeConditions(conditions)
  const where: string[] = [
    "people.status = 'active'",
    'people.deleted_at IS NULL',
  ]
  const params: Record<string, string | number> = {
    limit: normalized.limit,
  }

  if (normalized.categories.length > 0) {
    const categoryPlaceholders = normalized.categories.map((category, index) => {
      const key = `category${index}`
      params[key] = category
      return `@${key}`
    })
    where.push(`people.primary_category IN (${categoryPlaceholders.join(', ')})`)
  }

  if (normalized.region) {
    params.region = `%${normalized.region}%`
    where.push('people.region LIKE @region')
  }

  if (normalized.educationMin) {
    const minRank = EDUCATION_RANKS[normalized.educationMin] ?? 0
    params.educationMinRank = minRank
    where.push(`
      CASE people.education_level
        WHEN 'high_school' THEN 1
        WHEN 'secondary' THEN 2
        WHEN 'college' THEN 3
        WHEN 'bachelor' THEN 4
        WHEN 'master' THEN 5
        WHEN 'doctor' THEN 6
        ELSE 0
      END >= @educationMinRank
    `)
  }

  if (normalized.licenseQuery) {
    params.licenseQuery = `%${normalized.licenseQuery}%`
    where.push(`
      EXISTS (
        SELECT 1
        FROM licenses license_filter
        WHERE license_filter.person_id = people.id
          AND license_filter.status = 'active'
          AND (
            license_filter.normalized_license_name LIKE @licenseQuery
            OR license_filter.raw_license_name LIKE @licenseQuery
            OR license_filter.license_search_text LIKE @licenseQuery
          )
          AND (
            @includePendingReview = 1
            OR COALESCE(license_filter.needs_review, 0) = 0
          )
      )
    `)
  }

  if (!normalized.includePendingReview) {
    where.push("COALESCE(people.review_status, 'confirmed') != 'pending_review'")
    where.push(`
      NOT EXISTS (
        SELECT 1
        FROM person_documents review_documents
        WHERE review_documents.person_id = people.id
          AND review_documents.status = 'active'
          AND COALESCE(review_documents.needs_review, 0) = 1
      )
    `)
  }

  const rows = db.prepare(`
    SELECT
      people.id AS person_id,
      people.name,
      people.id_card_number,
      people.id_card_last4,
      people.masked_display,
      people.primary_category,
      people.region,
      people.education_level,
      GROUP_CONCAT(DISTINCT licenses.normalized_license_name) AS license_names,
      COUNT(DISTINCT person_documents.id) AS document_count
    FROM people
    LEFT JOIN licenses
      ON licenses.person_id = people.id
      AND licenses.status = 'active'
    LEFT JOIN person_documents
      ON person_documents.person_id = people.id
      AND person_documents.status = 'active'
    WHERE ${where.join('\n      AND ')}
    GROUP BY people.id
    ORDER BY people.name ASC, people.updated_at DESC
    LIMIT @limit
  `).all({
    ...params,
    includePendingReview: normalized.includePendingReview ? 1 : 0,
  }) as QueryPersonRow[]

  return rows.map((row) => ({
    personId: row.person_id,
    name: row.name,
    idCardNumber: row.id_card_number,
    idCardLast4: row.id_card_last4,
    maskedDisplay: row.masked_display,
    primaryCategory: row.primary_category,
    region: row.region,
    educationLevel: row.education_level,
    licenseNames: splitSqlList(row.license_names),
    documentCount: row.document_count,
    matchReason: createMatchReason(row, normalized),
  }))
}

export function normalizeConditions(conditions: QueryPeopleConditions): Required<QueryPeopleConditions> {
  const categories = (conditions.categories ?? [])
    .map((category) => category.trim())
    .filter(Boolean)

  return {
    categories: [...new Set(categories)],
    region: normalizeOptionalText(conditions.region),
    educationMin: normalizeOptionalText(conditions.educationMin),
    licenseQuery: normalizeOptionalText(conditions.licenseQuery),
    includePendingReview: Boolean(conditions.includePendingReview),
    limit: Number.isFinite(conditions.limit) && conditions.limit && conditions.limit > 0
      ? Math.min(Math.trunc(conditions.limit), 500)
      : 100,
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? ''
  return normalized.length > 0 ? normalized : null
}

function splitSqlList(value: string | null): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? []
}

function createMatchReason(row: QueryPersonRow, conditions: Required<QueryPeopleConditions>): string {
  const parts = [
    conditions.categories.length > 0 && row.primary_category ? `类别 ${row.primary_category}` : null,
    conditions.region && row.region ? `地区 ${row.region}` : null,
    conditions.educationMin && row.education_level ? `学历 ${row.education_level}` : null,
    conditions.licenseQuery && row.license_names ? `证书 ${row.license_names}` : null,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('；') : '符合当前查询条件'
}
