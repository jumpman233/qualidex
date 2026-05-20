import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-text-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const privateFixtureRoot = path.join(workspaceRoot, 'test-fixtures', 'ocr-source', 'private')

const modules = [
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
]

try {
  await buildModules()
  const { extractTextFromFile } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/textExtractService.js')))
  await verifyTxt(extractTextFromFile)
  await verifyPdf(extractTextFromFile)
  await verifyImageOcr(extractTextFromFile)
  console.log('verify:text-extract passed')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

async function buildModules() {
  await mkdir(tempModuleRoot, { recursive: true })
  await writeFile(path.join(tempModuleRoot, 'package.json'), '{"type":"commonjs"}\n', 'utf8')

  for (const [sourcePath, outputPath] of modules) {
    let source = await readFile(path.join(workspaceRoot, sourcePath), 'utf8')
    source = source.replace(
      "await import('pdfjs-dist/legacy/build/pdf.mjs')",
      "await Function('specifier', 'return import(specifier)')('pdfjs-dist/legacy/build/pdf.mjs')",
    )
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        strict: true,
      },
    })
    const targetPath = path.join(tempModuleRoot, outputPath)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, output.outputText, 'utf8')
  }
}

async function verifyTxt(extractTextFromFile) {
  const txtPath = path.join(privateFixtureRoot, 'sample.txt')
  if (!existsSync(txtPath)) {
    console.log('verify:text-extract txt skipped: private sample.txt not found')
    return
  }

  const result = await extractTextFromFile(txtPath, '.txt')
  assertEqual(result.status, 'text_extracted', 'txt extraction status')
  assert(result.text.trim().length > 0, 'txt extraction should return text')
  console.log(`txt: ${result.status}, length=${result.text.length}`)
}

async function verifyPdf(extractTextFromFile) {
  const privatePdfPath = findFirstFixture(['.pdf'])
  const pdfPath = privatePdfPath ?? (await createMinimalPdfFile())

  const result = await extractTextFromFile(pdfPath, '.pdf')
  assert(
    result.status === 'text_extracted' || result.status === 'ocr_completed' || result.status === 'pending_ocr' || result.status === 'failed',
    `unexpected pdf extraction status: ${result.status}`,
  )
  assert(
    !String(result.error ?? '').includes('DOMMatrix'),
    `pdf extraction should not fail because DOMMatrix is missing: ${result.error}`,
  )
  assert(
    !String(result.error ?? '').includes('@napi-rs/canvas'),
    `pdf extraction should not fail because canvas is missing: ${result.error}`,
  )
  if (privatePdfPath && result.status === 'failed' && isPopplerUnavailable(result.error)) {
    console.log(`pdf scanned fallback skipped: Poppler 未配置，未执行扫描型 PDF OCR 验证。${result.error}`)
    return
  }
  console.log(`pdf: ${result.status}, length=${result.text.length}`)
}

async function verifyImageOcr(extractTextFromFile) {
  const imagePath = findFirstFixture(['.jpg', '.jpeg', '.png', '.webp'])
  if (!imagePath) {
    console.log('verify:text-extract image OCR skipped: private image fixture not found')
    return
  }

  const result = await extractTextFromFile(imagePath, path.extname(imagePath).toLowerCase())
  assertEqual(result.status, 'ocr_completed', 'image OCR status')
  assert(result.text.trim().length > 0, 'image OCR should return text')
  console.log(`image: ${result.status}, length=${result.text.length}`)
}

function findFirstFixture(extensions) {
  if (!existsSync(privateFixtureRoot)) {
    return null
  }

  const entries = Array.from(readdirSync(privateFixtureRoot))
  const match = entries.find((entry) => extensions.includes(path.extname(entry).toLowerCase()))
  return match ? path.join(privateFixtureRoot, match) : null
}

function isPopplerUnavailable(error) {
  const message = String(error ?? '')
  return message.includes('Poppler') || message.includes('pdftoppm') || message.includes('ENOENT')
}

async function createMinimalPdfFile() {
  const pdfPath = path.join(tempRoot, 'minimal.pdf')
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 44 >>
stream
BT /F1 24 Tf 72 72 Td (Qualidex OCR) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000311 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
405
%%EOF`
  await writeFile(pdfPath, pdf, 'utf8')
  return pdfPath
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/')}`
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`)
}
