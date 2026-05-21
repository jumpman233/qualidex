import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-person-folder-verify-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const sourceRoot = path.join(tempRoot, '混合人员资料')
const zhangIdCardNumber = '510104199001011234'
const liIdCardNumber = '510104199202024321'

const modules = [
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/personFolderExtractService.ts', 'electron/services/personFolderExtractService.js'],
]

try {
  await buildModules()
  await createFixture()
  const { extractPersonFolder } = await import(pathToFileURL(path.join(
    tempModuleRoot,
    'electron/services/personFolderExtractService.js',
  )))

  let requestPayload = null
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    requestPayload = JSON.parse(body.messages[1].content)

    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              people: [
                {
                  person_name: '张三',
                  id_card_last4: '1234',
                  masked_display: '5101**********1234',
                  education: '本科 / 电气工程及其自动化',
                  certificates: [
                    {
                      certificate_name: '工程师',
                      certificate_specialty: '电气',
                      confidence: 0.92,
                      evidence: ['张三工程师证书中出现电气专业'],
                    },
                    {
                      certificate_name: '二级建造师',
                      certificate_specialty: '机电工程',
                      confidence: 0.89,
                      evidence: ['张三注册证书中出现机电工程'],
                    },
                  ],
                  confidence: 0.91,
                  needs_review: false,
                  review_reasons: [],
                  files: [
                    {
                      relative_path: path.join('张三', '身份证和学历.txt'),
                      relation_type: 'owner',
                      relation_confidence: 0.96,
                      evidence: ['文件中出现张三身份证号后四位'],
                    },
                    {
                      relative_path: path.join('张三', '工程师证.txt'),
                      relation_type: 'owner',
                      relation_confidence: 0.9,
                      evidence: ['路径和文本均指向张三'],
                    },
                    {
                      relative_path: '多人汇总.txt',
                      relation_type: 'multi_person',
                      relation_confidence: 0.72,
                      evidence: ['汇总文件同时出现张三和李四'],
                    },
                  ],
                },
                {
                  person_name: '李四',
                  id_card_last4: '4321',
                  masked_display: '5101**********4321',
                  education: '大专 / 建筑工程技术',
                  certificates: [
                    {
                      certificate_name: '安全员',
                      certificate_specialty: 'C证',
                      confidence: 0.88,
                      evidence: ['李四安全员证书中出现 C 证'],
                    },
                  ],
                  confidence: 0.86,
                  needs_review: false,
                  review_reasons: [],
                  files: [
                    {
                      relative_path: path.join('李四', '身份证学历和安全员.txt'),
                      relation_type: 'owner',
                      relation_confidence: 0.95,
                      evidence: ['文件中出现李四身份证号后四位'],
                    },
                    {
                      relative_path: '多人汇总.txt',
                      relation_type: 'multi_person',
                      relation_confidence: 0.72,
                      evidence: ['汇总文件同时出现张三和李四'],
                    },
                  ],
                },
              ],
              unresolved_files: [],
              confidence: 0.9,
              needs_review: false,
              review_reasons: [],
            }),
          },
        }],
      }),
    }
  }

  const result = await extractPersonFolder(sourceRoot, {
    config: {
      provider: 'mock',
      baseUrl: 'https://mock.local/v1',
      modelName: 'mock-model',
      apiKey: 'mock-key',
      sampleAcceptanceRate: 0,
      useJsonResponseFormat: false,
    },
  })

  assert(requestPayload, 'AI request payload captured')
  const requestPayloadText = JSON.stringify(requestPayload)
  assert(!requestPayloadText.includes(zhangIdCardNumber), 'AI payload should not include Zhang full ID card number')
  assert(!requestPayloadText.includes(liIdCardNumber), 'AI payload should not include Li full ID card number')
  assertEqual(result.people.length, 2, 'people count')
  assertEqual(result.unresolvedFiles.length, 0, 'unresolved file count')

  const zhang = result.people.find((person) => person.personName === '张三')
  const li = result.people.find((person) => person.personName === '李四')
  assert(zhang, 'Zhang person exists')
  assert(li, 'Li person exists')
  assertEqual(zhang.idCardNumber, zhangIdCardNumber, 'Zhang local full ID card number')
  assertEqual(li.idCardNumber, liIdCardNumber, 'Li local full ID card number')
  assertEqual(zhang.education, '本科 / 电气工程及其自动化', 'Zhang education')
  assertEqual(li.education, '大专 / 建筑工程技术', 'Li education')
  assertEqual(zhang.certificates.length, 2, 'Zhang certificate count')
  assertEqual(zhang.certificates[0].displayName, '工程师/电气', 'Zhang certificate display name')
  assertEqual(li.certificates[0].displayName, '安全员/C证', 'Li certificate display name')
  assert(zhang.files.some((file) => file.relativePath === '多人汇总.txt' && file.relationType === 'multi_person'), 'Zhang multi-person relation')
  assert(li.files.some((file) => file.relativePath === '多人汇总.txt' && file.relationType === 'multi_person'), 'Li multi-person relation')
  assertEqual(result.files.length, 4, 'all related files')

  console.log('verify:person-folder-extract passed')
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

async function createFixture() {
  await mkdir(path.join(sourceRoot, '张三'), { recursive: true })
  await mkdir(path.join(sourceRoot, '李四'), { recursive: true })
  await writeFile(
    path.join(sourceRoot, '张三', '身份证和学历.txt'),
    [
      '姓名：张三',
      `公民身份号码：${zhangIdCardNumber}`,
      '学历：本科',
      '专业：电气工程及其自动化',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(sourceRoot, '张三', '工程师证.txt'),
    [
      '张三',
      '工程师证书',
      '专业：电气',
      '二级建造师注册证书',
      '专业：机电工程',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(sourceRoot, '李四', '身份证学历和安全员.txt'),
    [
      '姓名：李四',
      `公民身份号码：${liIdCardNumber}`,
      '学历：大专',
      '专业：建筑工程技术',
      '安全员证书',
      '专业：C证',
    ].join('\n'),
    'utf8',
  )
  await writeFile(
    path.join(sourceRoot, '多人汇总.txt'),
    [
      '人员资料汇总',
      '张三 工程师 电气',
      '李四 安全员 C证',
    ].join('\n'),
    'utf8',
  )
}

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message)
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`)
}
