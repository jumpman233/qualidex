import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-ai-'))
const tempModuleRoot = path.join(tempRoot, 'modules')

const modules = [
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
]

try {
  await buildModules()
  const { loadAiModelConfig } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/aiConfig.js')))
  const { extractStructuredFields } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/aiExtractService.js')))
  const config = loadAiModelConfig(workspaceRoot)

  if (!config) {
    console.log('verify:ai-extract skipped: AI config not found in environment or .env.local')
    process.exitCode = 0
  } else {
    const result = await extractStructuredFields(config, {
      fileId: 'verify-file',
      fileName: '杜海全-身份证1.jpg',
      originalPath: 'test-fixtures/ocr-source/private/杜海全-身份证1.jpg',
      parentFolder: 'private',
      ocrText: [
        '姓名杜海全',
        '性别男民族汉',
        '出生1976年6月3日',
        '住址广东省深圳市罗湖区文锦中路1018号',
        '公民身份号码 142701197606032111',
      ].join('\n'),
    })

    assert(typeof result.document_type === 'string', 'document_type should be string')
    assert(result.person.name === '杜海全', 'person.name should be extracted')
    assert(result.person.id_card_last4 === '2111', 'id_card_last4 should keep only last 4 digits')
    assert(Array.isArray(result.evidence), 'evidence should be array')
    assert(result.confidence >= 0 && result.confidence <= 1, 'confidence should be 0-1')
    console.log(
      `verify:ai-extract passed (${config.provider}/${config.modelName}, document_type=${result.document_type}, confidence=${result.confidence})`,
    )
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

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/')}`
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}
