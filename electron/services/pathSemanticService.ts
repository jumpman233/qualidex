import path from 'node:path'

export interface PathSemanticInput {
  sourceRootPath: string
  relativePath: string
  fileName: string
  parentFolder: string
  defaultPrimaryCategory?: string | null
  defaultRegion?: string | null
}

export interface PathSemanticResult {
  candidate_primary_category: string | null
  candidate_region: string | null
  candidate_person_name: string | null
  candidate_document_type: string | null
  candidate_license_hint: string | null
  confidence: number
  evidence: string[]
}

const DEFAULT_CATEGORIES = new Set(['工程', '环境', '消防员', '未识别类别'])
const LOW_INFORMATION_SEGMENTS = new Set([
  '.',
  '',
  '新建文件夹',
  '资料',
  '扫描件',
  '图片',
  '照片',
  '文件',
  '临时',
  '待整理',
  '未命名',
  '其他',
  '附件',
])

const REGION_PATTERN = /(?:北京|上海|天津|重庆|成都|绵阳|德阳|乐山|泸州|南充|宜宾|达州|广元|遂宁|内江|自贡|攀枝花|眉山|雅安|资阳|广安|巴中|阿坝|甘孜|凉山|广州|深圳|杭州|南京|苏州|武汉|西安|长沙|郑州|青岛|宁波|厦门|福州|昆明|贵阳|南宁|海口|拉萨|兰州|西宁|银川|乌鲁木齐|石家庄|太原|沈阳|长春|哈尔滨|合肥|南昌|济南)(?:市|地区|州)?|[^\\/\s]{2,8}(?:省|市|区|县|州|盟)/

const DOCUMENT_TYPE_KEYWORDS: Array<{ type: string, keywords: string[] }> = [
  { type: 'id_card', keywords: ['身份证', '身份證', 'idcard'] },
  { type: 'diploma', keywords: ['毕业证', '畢業證', '学历', '學歷', '专科', '本科', '大专'] },
  { type: 'degree', keywords: ['学位', '學位'] },
  { type: 'license', keywords: ['证书', '證書', '证', '二建', '一建', '建造师', '安全员', '消防员', '执业', '资格', '注册'] },
  { type: 'other', keywords: ['承诺书', '证明', '其他'] },
]

const LICENSE_HINT_KEYWORDS = [
  '二建',
  '二级建造师',
  '一建',
  '一级建造师',
  '安全员',
  '消防员',
  '注册证',
  '执业资格',
  '资格证',
]

export function parsePathSemantics(input: PathSemanticInput): PathSemanticResult {
  const pathSegments = splitPathSegments(input.relativePath)
  const semanticSegments = pathSegments.filter((segment) => !isLowInformationSegment(segment))
  const fileBaseName = stripExtension(input.fileName)
  const evidence: string[] = []

  const category = input.defaultPrimaryCategory?.trim()
    || findCategory(semanticSegments, evidence)
  const region = input.defaultRegion?.trim()
    || findRegion(semanticSegments, evidence)
  const personName = findPersonName(input.parentFolder, semanticSegments, category, region, fileBaseName, evidence)
  const documentType = findDocumentType([fileBaseName, ...semanticSegments], evidence)
  const licenseHint = findLicenseHint([fileBaseName, ...semanticSegments], evidence)
  const confidence = calculateConfidence({
    category,
    region,
    personName,
    documentType,
    licenseHint,
    semanticSegmentCount: semanticSegments.length,
  })

  if (input.defaultPrimaryCategory?.trim()) {
    evidence.push(`导入默认主类别为 ${input.defaultPrimaryCategory.trim()}`)
  }
  if (input.defaultRegion?.trim()) {
    evidence.push(`导入默认地区为 ${input.defaultRegion.trim()}`)
  }

  return {
    candidate_primary_category: category || null,
    candidate_region: region || null,
    candidate_person_name: personName || null,
    candidate_document_type: documentType || null,
    candidate_license_hint: licenseHint || null,
    confidence,
    evidence,
  }
}

export function splitPathSegments(relativePath: string): string[] {
  return relativePath.split(path.sep)
    .flatMap((segment) => segment.split(/[\\/]/))
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function findCategory(segments: string[], evidence: string[]): string | null {
  for (const segment of segments) {
    const matched = [...DEFAULT_CATEGORIES].find((category) => segment.includes(category))
    if (matched && matched !== '未识别类别') {
      evidence.push(`路径层级包含主类别 ${matched}`)
      return matched
    }
  }

  return null
}

function findRegion(segments: string[], evidence: string[]): string | null {
  for (const segment of segments) {
    const match = segment.match(REGION_PATTERN)
    if (match) {
      const region = normalizeRegion(match[0])
      evidence.push(`路径层级包含地区 ${region}`)
      return region
    }
  }

  return null
}

function findPersonName(
  parentFolder: string,
  segments: string[],
  category: string | null,
  region: string | null,
  fileBaseName: string,
  evidence: string[],
): string | null {
  const candidates = [parentFolder, ...segments.slice().reverse()]
    .map((segment) => stripExtension(segment).trim())
    .filter((segment) => {
      return segment
        && segment !== fileBaseName
        && segment !== category
        && segment !== region
        && !isLowInformationSegment(segment)
        && !hasDocumentKeyword(segment)
        && !REGION_PATTERN.test(segment)
        && !DEFAULT_CATEGORIES.has(segment)
    })

  const candidate = candidates.find((segment) => /^[\u4e00-\u9fa5]{2,4}$/.test(segment))
  if (candidate) {
    evidence.push(`路径层级疑似人员 ${candidate}`)
    return candidate
  }

  return null
}

function findDocumentType(values: string[], evidence: string[]): string | null {
  for (const value of values) {
    const lower = value.toLowerCase()
    const matched = DOCUMENT_TYPE_KEYWORDS.find((item) => {
      return item.keywords.some((keyword) => lower.includes(keyword.toLowerCase()))
    })
    if (matched) {
      evidence.push(`路径或文件名包含资料类型线索 ${value}`)
      return matched.type
    }
  }

  return null
}

function findLicenseHint(values: string[], evidence: string[]): string | null {
  for (const value of values) {
    const matched = LICENSE_HINT_KEYWORDS.find((keyword) => value.includes(keyword))
    if (matched) {
      evidence.push(`路径或文件名包含证书线索 ${matched}`)
      return matched
    }
  }

  return null
}

function calculateConfidence(input: {
  category: string | null | undefined
  region: string | null | undefined
  personName: string | null | undefined
  documentType: string | null | undefined
  licenseHint: string | null | undefined
  semanticSegmentCount: number
}): number {
  let score = 0
  if (input.category) score += 0.2
  if (input.region) score += 0.2
  if (input.personName) score += 0.2
  if (input.documentType) score += 0.15
  if (input.licenseHint) score += 0.1
  if (input.semanticSegmentCount >= 3) score += 0.1

  return Math.min(Number(score.toFixed(2)), 0.95)
}

function normalizeRegion(value: string): string {
  return value.replace(/市$/, '').trim()
}

function isLowInformationSegment(value: string): boolean {
  return LOW_INFORMATION_SEGMENTS.has(stripExtension(value.trim()))
}

function hasDocumentKeyword(value: string): boolean {
  return DOCUMENT_TYPE_KEYWORDS.some((item) => item.keywords.some((keyword) => value.includes(keyword)))
}

function stripExtension(value: string): string {
  return value.slice(0, value.length - path.extname(value).length) || value
}
