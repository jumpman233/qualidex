import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-worker-ai-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempSourceRoot = path.join(tempRoot, 'scan-source')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/hashService.ts', 'electron/services/hashService.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
  ['electron/services/processingQueueService.ts', 'electron/services/processingQueueService.js'],
  ['electron/services/processingWorkerService.ts', 'electron/services/processingWorkerService.js'],
  ['electron/services/importService.ts', 'electron/services/importService.js'],
]

try {
  await buildModules()
  await createFixture()
  await createElectronVerifier()
  runElectronVerifier()
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
  await mkdir(tempSourceRoot, { recursive: true })
  await writeFile(path.join(tempSourceRoot, 'zhangsan-license.txt'), '姓名 张三\\n身份证后四位 1234\\n二级建造师注册证书', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'multi-person.txt'), '姓名 王五 李四\\n多人资料\\n消防员证书', 'utf8')
}

async function createElectronVerifier() {
  await mkdir(tempElectronApp, { recursive: true })
  await writeFile(path.join(tempElectronApp, 'package.json'), '{"main":"main.cjs"}\n', 'utf8')
  await writeFile(path.join(tempElectronApp, 'main.cjs'), getElectronVerifierSource(), 'utf8')
}

function runElectronVerifier() {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

  const result = spawnSync(executable, ['exec', 'electron', tempElectronApp], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`Electron worker AI success verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { existsSync } = require('node:fs');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { importDirectory } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/importService.js'))});
const { executeProcessingBatch } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/processingWorkerService.js'))});

process.env.APP_ROOT = ${JSON.stringify(tempRoot)};
process.env.AI_PROVIDER = 'mock-provider';
process.env.AI_BASE_URL = 'https://mock.local/v1';
process.env.AI_MODEL_NAME = 'mock-model';
process.env.AI_API_KEY = 'mock-key';
process.env.AI_SAMPLE_ACCEPTANCE_RATE = '1';
process.env.AI_USE_JSON_RESPONSE_FORMAT = 'false';

global.fetch = async (_url, request) => {
  const payload = JSON.parse(request.body);
  const userPayload = JSON.parse(payload.messages[1].content);
  const fileName = userPayload.file.file_name;
  const isMultiPerson = fileName.includes('multi-person');
  const result = isMultiPerson ? createMultiPersonAiResult() : createHighConfidenceAiResult();

  return {
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(result),
            },
          },
        ],
      });
    },
  };
};

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      const imported = await importDirectory(db, ${JSON.stringify(tempSourceRoot)}, {
        defaultPrimaryCategory: '工程',
        defaultRegion: '成都',
      });
      assertEqual(imported.totalFiles, 2, 'import total files');

      const batch = await executeProcessingBatch(db, 10);
      assertEqual(batch.remainingPendingTasks, 0, 'remaining pending after AI success batch');

      const aiResults = db.prepare('select count(*) as count from ai_extract_results').get().count;
      const people = db.prepare('select count(*) as count from people').get().count;
      const documents = db.prepare('select count(*) as count from person_documents').get().count;
      const licenses = db.prepare('select count(*) as count from licenses').get().count;
      const reviewItems = db.prepare('select count(*) as count from review_items').get().count;

      assertEqual(aiResults, 2, 'AI result count');
      assertEqual(people, 2, 'people count');
      assertEqual(documents, 2, 'person document count');
      assertEqual(licenses, 2, 'license count');
      assert(reviewItems >= 4, 'review item count for multi-person and low confidence');

      const zhangsan = db.prepare("select name, id_card_last4, primary_category, region, review_status, archive_dirty from people where name = '张三'").get();
      assertEqual(zhangsan.id_card_last4, '1234', 'id last4');
      assertEqual(zhangsan.primary_category, '工程', 'primary category');
      assertEqual(zhangsan.region, '成都', 'region');
      assertEqual(zhangsan.review_status, 'suggested', 'high confidence review status');
      assertEqual(zhangsan.archive_dirty, 1, 'archive dirty');

      const highLicense = db.prepare("select normalized_license_name, recognition_status, needs_review, issuer_authority_review_status from licenses where normalized_license_name = '二级建造师'").get();
      assertEqual(highLicense.recognition_status, 'suggested', 'high license recognition status');
      assertEqual(highLicense.needs_review, 0, 'high license review flag');
      assertEqual(highLicense.issuer_authority_review_status, 'confirmed', 'high issuer authority review status');

      const multiFile = db.prepare("select is_multi_person_file, process_status from files where file_name = 'multi-person.txt'").get();
      assertEqual(multiFile.is_multi_person_file, 1, 'multi-person file flag');
      assertEqual(multiFile.process_status, 'needs_review', 'multi-person file process status');

      const multiDoc = db.prepare("select relation_type, needs_review, review_reason from person_documents where file_id = (select id from files where file_name = 'multi-person.txt')").get();
      assertEqual(multiDoc.relation_type, 'multi_person', 'multi-person relation type');
      assertEqual(multiDoc.needs_review, 1, 'multi-person document review flag');
      assert(String(multiDoc.review_reason).includes('多人'), 'multi-person review reason');

      const multiLicense = db.prepare("select recognition_status, needs_review, issuer_authority_review_status from licenses where normalized_license_name = '消防员证书'").get();
      assertEqual(multiLicense.recognition_status, 'pending_review', 'multi license recognition status');
      assertEqual(multiLicense.needs_review, 1, 'multi license review flag');
      assertEqual(multiLicense.issuer_authority_review_status, 'pending_review', 'multi issuer review status');

      assert(existsSync(${JSON.stringify(path.join(tempSourceRoot, 'zhangsan-license.txt'))}), 'original file remains');

      console.log('verify:processing-worker-ai-success passed');
    } finally {
      db.close();
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function createHighConfidenceAiResult() {
  return {
    document_type: 'license',
    category: {
      primary_value: '工程',
      candidate_values: ['工程'],
      source: 'ocr_text',
      confidence: 0.94,
      needs_manual_review: false,
    },
    person: {
      name: '张三',
      id_card_last4: '1234',
    },
    region: {
      value: '成都',
      source: 'ocr_text',
      confidence: 0.91,
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
      valid_until: '2028-12-31',
      is_license_candidate: true,
    },
    multi_person: {
      is_multi_person_file: false,
      detected_people: [],
    },
    confidence: 0.93,
    needs_manual_review: false,
    review_reasons: [],
    evidence: ['OCR 中出现二级建造师'],
  };
}

function createMultiPersonAiResult() {
  return {
    document_type: 'license',
    category: {
      primary_value: '消防员',
      candidate_values: ['消防员', '工程'],
      source: 'ocr_text',
      confidence: 0.63,
      needs_manual_review: true,
    },
    person: {
      name: '王五',
      id_card_last4: null,
    },
    region: {
      value: null,
      source: 'unknown',
      confidence: 0.1,
    },
    education: {
      level: null,
      school: null,
      major: null,
    },
    license: {
      raw_license_name: '消防员证书',
      normalized_license_name: '消防员证书',
      license_category: '消防类资格',
      issuing_authority: '未知机构',
      valid_until: null,
      is_license_candidate: true,
    },
    multi_person: {
      is_multi_person_file: true,
      detected_people: [{ name: '王五', id_card_last4: null }, { name: '李四', id_card_last4: null }],
    },
    confidence: 0.62,
    needs_manual_review: true,
    review_reasons: ['疑似多人资料'],
    evidence: ['OCR 中出现多个人名'],
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + ': expected ' + expected + ', received ' + actual);
}
`
}
