import { readFile } from 'node:fs/promises'
import { extractImageText } from './ocrService'

export type TextExtractionStatus =
  | 'text_extracted'
  | 'ocr_completed'
  | 'pending_ocr'
  | 'unsupported'
  | 'failed'

export interface TextExtractionResult {
  text: string
  status: TextExtractionStatus
  processStatus: string
  error: string | null
  confidence: number | null
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const TEXT_EXTENSIONS = new Set(['.txt'])

export async function extractTextFromFile(filePath: string, ext: string): Promise<TextExtractionResult> {
  const normalizedExt = ext.toLowerCase()

  try {
    if (TEXT_EXTENSIONS.has(normalizedExt)) {
      const text = await readFile(filePath, 'utf8')
      return successfulExtraction(text, 'text_extracted')
    }

    if (normalizedExt === '.pdf') {
      const text = await extractPdfText(filePath)
      if (text.trim().length === 0) {
        return {
          text: '',
          status: 'pending_ocr',
          processStatus: 'needs_ocr',
          error: 'PDF 未提取到可复制文本，后续需要按页面做 OCR。',
          confidence: null,
        }
      }

      return successfulExtraction(text, 'text_extracted')
    }

    if (IMAGE_EXTENSIONS.has(normalizedExt)) {
      const ocrResult = await extractImageText(filePath)
      return {
        text: ocrResult.text,
        status: 'ocr_completed',
        processStatus: 'ocr_completed',
        error: null,
        confidence: ocrResult.confidence,
      }
    }

    return {
      text: '',
      status: 'unsupported',
      processStatus: 'unsupported',
      error: '当前阶段暂不提取该类型文件文本。',
      confidence: null,
    }
  } catch (error) {
    return {
      text: '',
      status: 'failed',
      processStatus: 'ocr_failed',
      error: getErrorMessage(error),
      confidence: null,
    }
  }
}

async function extractPdfText(filePath: string): Promise<string> {
  ensurePdfJsNodePolyfills()
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const buffer = await readFile(filePath)
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
  } as Parameters<typeof pdfjs.getDocument>[0]).promise
  const pageTexts: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const strings = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter((text) => text.trim().length > 0)

    if (strings.length > 0) {
      pageTexts.push(strings.join(' '))
    }
  }

  return pageTexts.join('\n\n')
}

function ensurePdfJsNodePolyfills(): void {
  const globalScope = globalThis as Record<string, unknown>

  if (!globalScope.DOMMatrix) {
    globalScope.DOMMatrix = SimpleDOMMatrix
  }

  if (!globalScope.ImageData) {
    globalScope.ImageData = SimpleImageData
  }

  if (!globalScope.Path2D) {
    globalScope.Path2D = SimplePath2D
  }
}

class SimpleDOMMatrix {
  a = 1
  b = 0
  c = 0
  d = 1
  e = 0
  f = 0

  constructor(init?: string | number[] | Float32Array | Float64Array | SimpleDOMMatrix) {
    if (Array.isArray(init) || init instanceof Float32Array || init instanceof Float64Array) {
      this.applyArray(Array.from(init))
    } else if (init instanceof SimpleDOMMatrix) {
      this.a = init.a
      this.b = init.b
      this.c = init.c
      this.d = init.d
      this.e = init.e
      this.f = init.f
    }
  }

  get m11(): number {
    return this.a
  }

  set m11(value: number) {
    this.a = value
  }

  get m12(): number {
    return this.b
  }

  set m12(value: number) {
    this.b = value
  }

  get m21(): number {
    return this.c
  }

  set m21(value: number) {
    this.c = value
  }

  get m22(): number {
    return this.d
  }

  set m22(value: number) {
    this.d = value
  }

  get m41(): number {
    return this.e
  }

  set m41(value: number) {
    this.e = value
  }

  get m42(): number {
    return this.f
  }

  set m42(value: number) {
    this.f = value
  }

  get is2D(): boolean {
    return true
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
  }

  multiplySelf(other?: SimpleDOMMatrix | number[]): this {
    const matrix = other instanceof SimpleDOMMatrix ? other : new SimpleDOMMatrix(other)
    const a = this.a * matrix.a + this.c * matrix.b
    const b = this.b * matrix.a + this.d * matrix.b
    const c = this.a * matrix.c + this.c * matrix.d
    const d = this.b * matrix.c + this.d * matrix.d
    const e = this.a * matrix.e + this.c * matrix.f + this.e
    const f = this.b * matrix.e + this.d * matrix.f + this.f

    this.a = a
    this.b = b
    this.c = c
    this.d = d
    this.e = e
    this.f = f
    return this
  }

  preMultiplySelf(other?: SimpleDOMMatrix | number[]): this {
    const matrix = other instanceof SimpleDOMMatrix ? other : new SimpleDOMMatrix(other)
    return this.copyFrom(new SimpleDOMMatrix(matrix).multiplySelf(this))
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiplySelf(new SimpleDOMMatrix([1, 0, 0, 1, tx, ty]))
  }

  scaleSelf(scaleX = 1, scaleY = scaleX): this {
    return this.multiplySelf(new SimpleDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]))
  }

  rotateSelf(): this {
    return this
  }

  inverse(): SimpleDOMMatrix {
    const determinant = this.a * this.d - this.b * this.c
    if (determinant === 0) {
      return new SimpleDOMMatrix()
    }

    return new SimpleDOMMatrix([
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    ])
  }

  transformPoint(point: { x?: number; y?: number; z?: number; w?: number }): { x: number; y: number; z: number; w: number } {
    const x = point.x ?? 0
    const y = point.y ?? 0
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: point.z ?? 0,
      w: point.w ?? 1,
    }
  }

  private applyArray(values: number[]): void {
    if (values.length >= 6) {
      this.a = values[0]
      this.b = values[1]
      this.c = values[2]
      this.d = values[3]
      this.e = values[4]
      this.f = values[5]
    }
  }

  private copyFrom(matrix: SimpleDOMMatrix): this {
    this.a = matrix.a
    this.b = matrix.b
    this.c = matrix.c
    this.d = matrix.d
    this.e = matrix.e
    this.f = matrix.f
    return this
  }
}

class SimpleImageData {
  data: Uint8ClampedArray
  width: number
  height: number

  constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
    if (typeof dataOrWidth === 'number') {
      this.width = dataOrWidth
      this.height = widthOrHeight
      this.data = new Uint8ClampedArray(this.width * this.height * 4)
      return
    }

    this.data = dataOrWidth
    this.width = widthOrHeight
    this.height = height ?? Math.floor(dataOrWidth.length / widthOrHeight / 4)
  }
}

class SimplePath2D {
  addPath(): void {}
  closePath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  rect(): void {}
  roundRect(): void {}
  arc(): void {}
  ellipse(): void {}
}

function successfulExtraction(text: string, status: 'text_extracted' | 'ocr_completed'): TextExtractionResult {
  return {
    text,
    status,
    processStatus: status,
    error: null,
    confidence: null,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
