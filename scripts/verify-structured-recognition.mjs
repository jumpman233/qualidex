import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-structured-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
]

try {
  await buildModules()
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
    throw new Error(`Electron structured recognition verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { persistStructuredRecognition } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/structuredRecognitionService.js'))});

process.env.APP_ROOT = ${JSON.stringify(tempRoot)};

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedFile(db, 'file-1', '张三二建证.pdf');
      const input = {
        fileId: 'file-1',
        fileName: '张三二建证.pdf',
        originalPath: 'fixture/张三二建证.pdf',
        parentFolder: '张三',
        ocrText: '姓名 张三 身份证号 110101199003071234 二级建造师 注册证书',
        defaultPrimaryCategory: '工程',
        defaultRegion: '成都',
      };
      const highConfidenceResult = createResult({
        name: '张三',
        idCardLast4: '1234',
        primaryCategory: '工程',
        region: '成都',
        confidence: 0.92,
        categoryConfidence: 0.93,
        regionConfidence: 0.91,
      });

      const first = persistStructuredRecognition(db, input, highConfidenceResult, []);
      assert(first.personId, 'first result should create person');
      assert(first.personDocumentId, 'first result should create person document');
      assert(first.licenseId, 'first result should create license');
      assertEqual(first.licenseIds.length, 2, 'first result should create multiple licenses');
      assertEqual(first.personMatchStrategy, 'created', 'first person strategy');

      seedFile(db, 'file-2', '张三安全员证.txt');
      const second = persistStructuredRecognition(db, {
        ...input,
        fileId: 'file-2',
        fileName: '张三安全员证.txt',
        originalPath: 'fixture/张三安全员证.txt',
      }, highConfidenceResult, []);
      assertEqual(second.personId, first.personId, 'same name and id last4 should reuse person');
      assertEqual(second.personMatchStrategy, 'id_card_hash', 'second person strategy');

      seedFile(db, 'file-3', '李四证书.txt');
      const lowConfidenceResult = createResult({
        name: '李四',
        idCardLast4: null,
        primaryCategory: '工程',
        region: null,
        confidence: 0.55,
        categoryConfidence: 0.7,
        regionConfidence: 0.1,
        normalizedLicenseName: null,
        needsManualReview: true,
      });
      const low = persistStructuredRecognition(db, {
        ...input,
        fileId: 'file-3',
        fileName: '李四证书.txt',
        originalPath: 'fixture/李四证书.txt',
        ocrText: '姓名 李四 证书',
      }, lowConfidenceResult, ['地区未知或置信度低']);
      assert(low.personId, 'low confidence should still create suggested person');
      assert(low.licenseId, 'low confidence license candidate should create license');
      assertEqual(low.licenseIds.length, 1, 'low confidence should create one license');
      assert(low.reviewItemCount >= 2, 'low confidence should create review items');

      seedFile(db, 'file-4', '张三冲突.txt');
      db.prepare("update files set path_parse_result = @pathParseResult, path_confidence = 0.8 where id = 'file-4'").run({
        pathParseResult: JSON.stringify({
          candidate_primary_category: '工程',
          candidate_region: '成都',
          candidate_person_name: '张三',
          candidate_document_type: 'license',
          candidate_license_hint: '二级建造师',
          confidence: 0.8,
          evidence: ['路径层级包含主类别 工程', '路径层级包含地区 成都', '路径层级疑似人员 张三'],
        }),
      });
      const conflictResult = createResult({
        name: '张三',
        idCardLast4: null,
        primaryCategory: '消防员',
        region: '重庆',
        confidence: 0.82,
        categoryConfidence: 0.84,
        regionConfidence: 0.83,
      });
      const conflict = persistStructuredRecognition(db, {
        ...input,
        fileId: 'file-4',
        fileName: '张三冲突.txt',
        originalPath: 'fixture/张三冲突.txt',
        ocrText: '姓名 张三 消防员 地区 重庆',
      }, conflictResult, []);
      assert(conflict.personId, 'conflict should create a pending person');
      assertEqual(conflict.personMatchStrategy, 'person_merge_conflict', 'conflict strategy');

      const peopleCount = db.prepare('select count(*) as count from people').get().count;
      const documentCount = db.prepare('select count(*) as count from person_documents').get().count;
      const licenseCount = db.prepare('select count(*) as count from licenses').get().count;
      const reviewCount = db.prepare('select count(*) as count from review_items').get().count;
      const dirtyCount = db.prepare('select count(*) as count from people where archive_dirty = 1').get().count;
      const multiPersonCount = db.prepare('select count(*) as count from files where is_multi_person_file = 1').get().count;

      assertEqual(peopleCount, 3, 'people count');
      assertEqual(documentCount, 4, 'person document count');
      assertEqual(licenseCount, 7, 'license count');
      assert(reviewCount >= 3, 'review item count');
      const pathConflictRows = db.prepare("select item_type, reason from review_items where ref_id = 'file-4' order by item_type").all();
      assert(pathConflictRows.some((row) => row.item_type === 'path_category_conflict'), 'path category conflict review');
      assert(pathConflictRows.some((row) => row.item_type === 'path_region_conflict'), 'path region conflict review');
      assertEqual(dirtyCount, 3, 'archive dirty people');
      assertEqual(multiPersonCount, 0, 'multi-person file count');

      const zhangSan = db.prepare("select id_card_number, id_card_last4, id_card_hash, masked_display from people where id = @id").get({ id: first.personId });
      assertEqual(zhangSan.id_card_number, '110101199003071234', 'full id card number');
      assertEqual(zhangSan.id_card_last4, '1234', 'id card last4');
      assert(zhangSan.id_card_hash && zhangSan.id_card_hash.length === 64, 'id card hash should be sha256');
      assertEqual(zhangSan.masked_display, '1101**********1234', 'masked display');

      const licenses = db.prepare("select normalized_license_name, detected_categories, needs_review, recognition_status, official_status, official_status_source from licenses where file_id = 'file-1' order by normalized_license_name").all();
      assertEqual(licenses.length, 2, 'file-1 license count');
      assert(licenses.some((item) => item.normalized_license_name === '二级建造师'), 'file-1 includes 二级建造师');
      assert(licenses.some((item) => item.normalized_license_name === '安全员证'), 'file-1 includes 安全员证');
      const license = licenses.find((item) => item.normalized_license_name === '二级建造师');
      assertEqual(JSON.parse(license.detected_categories)[0], '工程', 'detected category');
      assertEqual(license.needs_review, 0, 'high confidence license review flag');
      assertEqual(license.recognition_status, 'suggested', 'high confidence recognition status');
      assertEqual(license.official_status, null, 'license official status should default to null');
      assertEqual(license.official_status_source, null, 'license official status source should default to null');

      const lowLicense = db.prepare("select needs_review, recognition_status from licenses where file_id = 'file-3'").get();
      assertEqual(lowLicense.needs_review, 1, 'low confidence license review flag');
      assertEqual(lowLicense.recognition_status, 'pending_review', 'low confidence recognition status');

      console.log('verify:structured-recognition passed');
    } finally {
      db.close();
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function seedFile(db, id, fileName) {
  db.prepare("insert into files (id, original_path, file_name, ocr_text, ocr_status, process_status, created_at, updated_at) values (@id, @originalPath, @fileName, @ocrText, 'text_extracted', 'ai_extracted', 'now', 'now')").run({
    id,
    originalPath: 'fixture/' + fileName,
    fileName,
    ocrText: 'fixture text ' + fileName,
  });
}

function createResult(options) {
  return {
    document_type: 'license',
    category: {
      primary_value: options.primaryCategory,
      candidate_values: [options.primaryCategory].filter(Boolean),
      source: 'ocr_text',
      confidence: options.categoryConfidence,
      needs_manual_review: Boolean(options.needsManualReview),
    },
    person: {
      name: options.name,
      id_card_last4: options.idCardLast4,
      masked_display: options.idCardLast4 ? '1101**********' + options.idCardLast4 : null,
    },
    region: {
      value: options.region,
      source: 'ocr_text',
      confidence: options.regionConfidence,
    },
    education: {
      level: null,
      school: null,
      major: null,
    },
    license: {
      raw_license_name: options.normalizedLicenseName === null ? '未知证书' : '二级建造师注册证书',
      normalized_license_name: options.normalizedLicenseName === null ? null : '二级建造师',
      license_category: '建筑工程注册类执业资格',
      issuing_authority: '住房城乡建设部门',
      valid_until: '2028-12-31',
      is_license_candidate: true,
    },
    licenses: options.normalizedLicenseName === null
      ? [{
          raw_license_name: '未知证书',
          normalized_license_name: null,
          license_category: '建筑工程注册类执业资格',
          issuing_authority: '住房城乡建设部门',
          valid_until: '2028-12-31',
          is_license_candidate: true,
        }]
      : [
          {
            raw_license_name: '二级建造师注册证书',
            normalized_license_name: '二级建造师',
            license_category: '建筑工程注册类执业资格',
            issuing_authority: '住房城乡建设部门',
            valid_until: '2028-12-31',
            is_license_candidate: true,
          },
          {
            raw_license_name: '建筑施工企业专职安全生产管理人员证书',
            normalized_license_name: '安全员证',
            license_category: '安全生产类资格',
            issuing_authority: '住房城乡建设部门',
            valid_until: '2027-06-30',
            is_license_candidate: true,
          },
        ],
    multi_person: {
      is_multi_person_file: false,
      detected_people: [],
    },
    confidence: options.confidence,
    needs_manual_review: Boolean(options.needsManualReview),
    review_reasons: [],
    evidence: ['OCR 中出现证书名称'],
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
