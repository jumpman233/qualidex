import { createHash } from 'node:crypto'

export interface NormalizedIdCard {
  idCardNumber: string
  idCardLast4: string
  idCardHash: string
  maskedDisplay: string
}

const MAINLAND_ID_CARD_PATTERN = /(?<!\d)([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])(?!\d)/g

export function normalizeIdCardNumber(value: string | null | undefined): NormalizedIdCard | null {
  const raw = value?.trim() ?? ''
  if (!raw) {
    return null
  }

  const compact = raw.replace(/[\s-]/g, '').toUpperCase()
  if (!/^[1-9]\d{16}[\dX]$/.test(compact)) {
    return null
  }

  return {
    idCardNumber: compact,
    idCardLast4: compact.slice(-4),
    idCardHash: hashIdCardNumber(compact),
    maskedDisplay: maskIdCardNumber(compact),
  }
}

export function extractIdCardNumbers(text: string | null | undefined): NormalizedIdCard[] {
  if (!text) {
    return []
  }

  const matches = [...text.matchAll(MAINLAND_ID_CARD_PATTERN)]
    .map((match) => normalizeIdCardNumber(match[1]))
    .filter((value): value is NormalizedIdCard => Boolean(value))

  const seen = new Set<string>()
  return matches.filter((item) => {
    if (seen.has(item.idCardNumber)) {
      return false
    }
    seen.add(item.idCardNumber)
    return true
  })
}

export function sanitizeIdCardsForAi(text: string): string {
  return text.replace(MAINLAND_ID_CARD_PATTERN, (_match, idCard: string) => {
    const normalized = normalizeIdCardNumber(idCard)
    return normalized ? normalized.maskedDisplay : '[身份证号已脱敏]'
  })
}

export function hashIdCardNumber(idCardNumber: string): string {
  return createHash('sha256').update(idCardNumber).digest('hex')
}

export function maskIdCardNumber(idCardNumber: string): string {
  if (idCardNumber.length < 8) {
    return idCardNumber
  }

  return `${idCardNumber.slice(0, 4)}**********${idCardNumber.slice(-4)}`
}
