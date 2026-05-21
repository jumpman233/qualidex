import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-id-card-'))
const tempModuleRoot = path.join(tempRoot, 'modules')

const modules = [
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
]

try {
  await buildModules()
  const { extractIdCardNumbers, sanitizeIdCardsForAi } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/idCardService.js')))
  const { extractStructuredFields } = await import(pathToFileUrl(path.join(tempModuleRoot, 'electron/services/aiExtractService.js')))

  const text = '姓名 张三 身份证号 110101199003071234 证书 二级建造师'
  const idCards = extractIdCardNumbers(text)
  assertEqual(idCards.length, 1, 'extract id card count')
  assertEqual(idCards[0].idCardNumber, '110101199003071234', 'full id card')
  assertEqual(idCards[0].idCardLast4, '1234', 'last4')
  assertEqual(idCards[0].maskedDisplay, '1101**********1234', 'masked display')
  assert(idCards[0].idCardHash.length === 64, 'sha256 hash length')
  assertEqual(sanitizeIdCardsForAi(text).includes('110101199003071234'), false, 'sanitized text should remove full id')

  let requestBody = ''
  globalThis.fetch = async (_url, options) => {
    requestBody = String(options.body)
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  document_type: 'license',
                  category: {
                    primary_value: '工程',
                    candidate_values: ['工程'],
                    source: 'ocr_text',
                    confidence: 0.9,
                    needs_manual_review: false,
                  },
                  person: {
                    name: '张三',
                    id_card_last4: '1234',
                    masked_display: '1101**********1234',
                  },
                  region: {
                    value: '成都',
                    source: 'ocr_text',
                    confidence: 0.9,
                  },
                  education: {
                    level: null,
                    school: null,
                    major: null,
                  },
                  license: {
                    raw_license_name: '二级建造师注册证书',
                    normalized_license_name: '二级建造师',
                    license_category: '建筑工程注册类执业资格',
                    issuing_authority: '住房城乡建设部门',
                    valid_until: null,
                    is_license_candidate: true,
                  },
                  multi_person: {
                    is_multi_person_file: false,
                    detected_people: [],
                  },
                  confidence: 0.9,
                  needs_manual_review: false,
                  review_reasons: [],
                  evidence: ['OCR 中出现证书名称'],
                }),
              },
            },
          ],
        })
      },
    }
  }

  const result = await extractStructuredFields({
    provider: 'fixture',
    baseUrl: 'https://example.invalid',
    modelName: 'fixture-model',
    apiKey: 'fixture-key',
    sampleAcceptanceRate: 1,
    useJsonResponseFormat: false,
  }, {
    fileId: 'file-1',
    fileName: '张三-110101199003071234.pdf',
    originalPath: 'fixture/张三-110101199003071234.pdf',
    parentFolder: '张三-110101199003071234',
    ocrText: text,
  })

  assertEqual(requestBody.includes('110101199003071234'), false, 'AI request body should not contain full id card')
  assertEqual(result.person.id_card_last4, '1234', 'AI result last4')
  assertEqual(result.person.masked_display, '1101**********1234', 'AI result masked display')

  console.log('verify:id-card-privacy passed')
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
  return new URL(`file://${path.resolve(filePath).replace(/\\/g, '/')}`).href
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`)
}
