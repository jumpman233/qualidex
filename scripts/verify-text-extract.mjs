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
  const pdfPath = findFirstFixture(['.pdf'])
  if (!pdfPath) {
    console.log('verify:text-extract pdf skipped: private PDF fixture not found')
    return
  }

  const result = await extractTextFromFile(pdfPath, '.pdf')
  assert(
    result.status === 'text_extracted' || result.status === 'pending_ocr' || result.status === 'failed',
    `unexpected pdf extraction status: ${result.status}`,
  )
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
