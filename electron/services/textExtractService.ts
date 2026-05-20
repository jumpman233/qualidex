import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractImageText } from './ocrService'
import { extractPdfTextLayer, rasterizePdfPages } from './pdfRasterService'

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
      const pdfTextResult = await tryExtractPdfText(filePath)
      const text = pdfTextResult.text
      if (text.trim().length === 0) {
        return await extractScannedPdfText(filePath, pdfTextResult.error)
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

async function tryExtractPdfText(filePath: string): Promise<{ text: string; error: string | null }> {
  try {
    return {
      text: await extractPdfTextLayer(filePath),
      error: null,
    }
  } catch (error) {
    return {
      text: '',
      error: getErrorMessage(error),
    }
  }
}

async function extractScannedPdfText(filePath: string, pdfTextError: string | null): Promise<TextExtractionResult> {
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'qualidex-pdf-ocr-'))

  try {
    const rasterResult = await rasterizePdfPages(filePath, tempDirectory)
    const pageResults = []

    for (const [index, imagePath] of rasterResult.imagePaths.entries()) {
      const pageResult = await extractImageText(imagePath)
      pageResults.push({
        pageNumber: index + 1,
        ...pageResult,
      })
    }

    const pageTexts = pageResults
      .map((result) => result.text.trim())
      .filter(Boolean)
      .map((text, index) => `第 ${index + 1} 页\n${text}`)
    const text = pageTexts.join('\n\n')
    const confidence = averageConfidence(pageResults.map((result) => result.confidence))

    if (text.trim().length === 0) {
      return {
        text: '',
        status: 'pending_ocr',
        processStatus: 'needs_review',
        error: appendDetails('PDF 页面 OCR 未识别到文字。', pdfTextError, rasterResult.warnings),
        confidence,
      }
    }

    return {
      text,
      status: 'ocr_completed',
      processStatus: 'ocr_completed',
      error: appendDetails(null, pdfTextError, rasterResult.warnings),
      confidence,
    }
  } finally {
    if (!shouldKeepPdfOcrTemp()) {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  }
}

function averageConfidence(values: Array<number | null>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === 'number')
  if (numericValues.length === 0) {
    return null
  }

  return numericValues.reduce((total, value) => total + value, 0) / numericValues.length
}

function appendDetails(message: string | null, pdfTextError: string | null, warnings: string[]): string | null {
  const details = [
    message,
    pdfTextError ? `PDF 文本层提取失败：${pdfTextError}` : null,
    ...warnings,
  ].filter(Boolean)

  return details.length > 0 ? details.join('\n') : null
}

function shouldKeepPdfOcrTemp(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.KEEP_PDF_OCR_TEMP ?? '').trim().toLowerCase())
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
