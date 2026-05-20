import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-ocr-ai-real-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const privateFixtureRoot = path.join(workspaceRoot, 'test-fixtures', 'ocr-source', 'private')

const inputPath = readOption('--file')
const defaultPrimaryCategory = readOption('--category')
const defaultRegion = readOption('--region')
const supportedExtensions = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.txt'])

const modules = [
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
]

try {
  await buildModules()
  const { extractTextFromFile } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/textExtractService.js')))
  const { loadAiModelConfig } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/aiConfig.js')))
  const { extractStructuredFields } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/aiExtractService.js')))

  const config = loadAiModelConfig(workspaceRoot)
  if (!config) {
    console.log('verify:ocr-ai-real skipped: AI config not found in environment or .env.local')
    process.exitCode = 0
  } else {
    const samplePath = resolveSamplePath()
    const ext = path.extname(samplePath).toLowerCase()
    console.log(`sample: ${samplePath}`)

    const extraction = await extractTextFromFile(samplePath, ext)
    console.log(`text extraction: status=${extraction.status}, processStatus=${extraction.processStatus}, confidence=${formatNullableNumber(extraction.confidence)}`)
    if (extraction.error) {
      console.log(`text extraction note: ${extraction.error}`)
    }

    const ocrText = extraction.text.trim()
    if (!ocrText) {
      throw new Error('OCR/text extraction returned empty text; cannot call AI.')
    }

    console.log(`ocr text length: ${ocrText.length}`)
    console.log(`ocr text preview:\n${ocrText.slice(0, 800)}${ocrText.length > 800 ? '\n...' : ''}`)

    const result = await extractStructuredFields(config, {
      fileId: 'verify-ocr-ai-real-file',
      fileName: path.basename(samplePath),
      originalPath: samplePath,
      parentFolder: path.basename(path.dirname(samplePath)),
      ocrText,
      defaultPrimaryCategory,
      defaultRegion,
    })

    console.log(`ai model: ${config.provider}/${config.modelName}`)
    console.log('ai structured result:')
    console.log(JSON.stringify(result, null, 2))
    console.log('verify:ocr-ai-real passed')
  }
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

async function buildModules() {
  await mkdir(tempModuleRoot, { recursive: true })
  await writeFile(path.join(tempModuleRoot, 'package.json'), '{"type":"commonjs"}\n', 'utf8')

  for (const [sourcePath, outputPath] of modules) {
    const source = await readFile(path.join(workspaceRoot, sourcePath), 'utf8')
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

function resolveSamplePath() {
  if (inputPath) {
    const resolved = path.resolve(workspaceRoot, inputPath)
    assert(existsSync(resolved), `sample file not found: ${resolved}`)
    assert(supportedExtensions.has(path.extname(resolved).toLowerCase()), `unsupported sample extension: ${resolved}`)
    return resolved
  }

  assert(existsSync(privateFixtureRoot), `private fixture directory not found: ${privateFixtureRoot}`)
  const entries = readdirSync(privateFixtureRoot)
    .map((entry) => path.join(privateFixtureRoot, entry))
    .filter((entry) => supportedExtensions.has(path.extname(entry).toLowerCase()))
    .sort(compareSamplePriority)

  assert(entries.length > 0, `no supported private samples found in ${privateFixtureRoot}`)
  return entries[0]
}

function compareSamplePriority(left, right) {
  return samplePriority(left) - samplePriority(right) || left.localeCompare(right)
}

function samplePriority(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') {
    return 0
  }
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
    return 1
  }
  return 2
}

function readOption(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) {
    return null
  }

  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }

  return value
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/')}`
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function formatNullableNumber(value) {
  return typeof value === 'number' ? value.toFixed(3) : 'null'
}
