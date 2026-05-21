import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-folder-merge-'))
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

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Electron folder merge verifier failed with exit code ${result.status ?? 'unknown'}`)
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
      seedBatch(db);

      seedFile(db, 'file-id-card', '身份证.txt', '姓名 张三 身份证号 110101199003071234');
      const anchor = persistStructuredRecognition(db, createInput({
        fileId: 'file-id-card',
        fileName: '身份证.txt',
        ocrText: '姓名 张三 身份证号 110101199003071234',
      }), createResult({
        name: '张三',
        idCardLast4: '1234',
        licenseName: '二级建造师',
      }), []);
      assert(anchor.personId, 'anchor person should be created');
      assertEqual(anchor.personMatchStrategy, 'created', 'anchor strategy');

      seedFile(db, 'file-license-no-person', '安全员证.txt', '安全员证 继续教育合格');
      const folderMerged = persistStructuredRecognition(db, createInput({
        fileId: 'file-license-no-person',
        fileName: '安全员证.txt',
        ocrText: '安全员证 继续教育合格',
      }), createResult({
        name: null,
        idCardLast4: null,
        licenseName: '安全员证',
      }), []);
      assertEqual(folderMerged.personId, anchor.personId, 'folder merge should reuse anchor person');
      assertEqual(folderMerged.personMatchStrategy, 'folder_single_id_card', 'folder merge strategy');
      assertEqual(folderMerged.licenseIds.length, 1, 'folder-merged license count');

      const reassignedDoc = db.prepare("select person_id from person_documents where file_id = 'file-license-no-person'").get();
      assertEqual(reassignedDoc.person_id, anchor.personId, 'folder-merged document person');
      const reassignedLicense = db.prepare("select person_id, normalized_license_name from licenses where file_id = 'file-license-no-person'").get();
      assertEqual(reassignedLicense.person_id, anchor.personId, 'folder-merged license person');
      assertEqual(reassignedLicense.normalized_license_name, '安全员证', 'folder-merged license name');

      seedFile(db, 'file-conflict', '赵六证书.txt', '姓名 赵六 身份证号 110101199003075555');
      const conflict = persistStructuredRecognition(db, createInput({
        fileId: 'file-conflict',
        fileName: '赵六证书.txt',
        ocrText: '姓名 赵六 身份证号 110101199003075555',
      }), createResult({
        name: '赵六',
        idCardLast4: '5555',
        licenseName: '消防员证书',
      }), []);
      assert(conflict.personId && conflict.personId !== anchor.personId, 'conflict should create a separate person');

      const conflictReviews = db.prepare("select reason from review_items where ref_id = 'file-conflict'").all().map((row) => row.reason);
      assert(conflictReviews.includes('同一文件夹出现多个完整身份证号'), 'folder id-card conflict review');
      assert(conflictReviews.includes('同一文件夹出现多个人名'), 'folder person-name conflict review');

      const folderRows = db.prepare("select folder_merge_key, folder_merge_result, folder_merge_confidence from files where parent_folder = '张三资料'").all();
      assertEqual(folderRows.length, 3, 'folder row count');
      assert(folderRows.every((row) => row.folder_merge_key), 'folder merge key recorded');
      assert(folderRows.every((row) => row.folder_merge_result), 'folder merge result recorded');
      assert(folderRows.every((row) => row.folder_merge_confidence === 0.3), 'conflict folder confidence recorded');
      const mergeResult = JSON.parse(folderRows[0].folder_merge_result);
      assertEqual(mergeResult.anchor_person_id, anchor.personId, 'folder merge anchor recorded');
      assert(mergeResult.id_card_last4_values.includes('1234'), 'folder merge includes anchor id last4');
      assert(mergeResult.id_card_last4_values.includes('5555'), 'folder merge includes conflict id last4');

      const peopleCount = db.prepare('select count(*) as count from people').get().count;
      const licenseCount = db.prepare('select count(*) as count from licenses').get().count;
      assertEqual(peopleCount, 2, 'people count');
      assertEqual(licenseCount, 3, 'license count');

      console.log('verify:folder-merge passed');
    } finally {
      db.close();
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function seedBatch(db) {
  db.prepare("insert into import_batches (id, batch_type, source_path, status, created_at, updated_at) values ('batch-1', 'full_import', 'fixture-root', 'completed', 'now', 'now')").run();
}

function seedFile(db, id, fileName, ocrText) {
  db.prepare(\`
    insert into files (
      id,
      original_path,
      file_name,
      source_batch_id,
      source_root_path,
      relative_path,
      parent_folder,
      ocr_text,
      ocr_status,
      process_status,
      created_at,
      updated_at
    )
    values (
      @id,
      @originalPath,
      @fileName,
      'batch-1',
      'fixture-root',
      @relativePath,
      '张三资料',
      @ocrText,
      'text_extracted',
      'ai_extracted',
      'now',
      'now'
    )
  \`).run({
    id,
    originalPath: 'fixture-root/张三资料/' + fileName,
    fileName,
    relativePath: '张三资料/' + fileName,
    ocrText,
  });
}

function createInput(options) {
  return {
    fileId: options.fileId,
    fileName: options.fileName,
    originalPath: 'fixture-root/张三资料/' + options.fileName,
    parentFolder: '张三资料',
    ocrText: options.ocrText,
    defaultPrimaryCategory: '工程',
    defaultRegion: '成都',
  };
}

function createResult(options) {
  const license = {
    raw_license_name: options.licenseName,
    normalized_license_name: options.licenseName,
    license_category: '资格证书',
    issuing_authority: '测试机构',
    valid_until: null,
    is_license_candidate: true,
  };

  return {
    document_type: 'license',
    category: {
      primary_value: '工程',
      candidate_values: ['工程'],
      source: 'ocr_text',
      confidence: 0.92,
      needs_manual_review: false,
    },
    person: {
      name: options.name,
      id_card_last4: options.idCardLast4,
      masked_display: options.idCardLast4 ? '1101**********' + options.idCardLast4 : null,
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
    license,
    licenses: [license],
    multi_person: {
      is_multi_person_file: false,
      detected_people: [],
    },
    confidence: 0.92,
    needs_manual_review: false,
    review_reasons: [],
    evidence: ['测试证据'],
  };
}

function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + ': expected ' + expected + ', received ' + actual);
}
`
}
