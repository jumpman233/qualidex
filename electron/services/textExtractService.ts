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
