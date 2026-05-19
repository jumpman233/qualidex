import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-archive-preview-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempSourceRoot = path.join(tempRoot, 'source')
const tempOutputRoot = path.join(tempRoot, 'archive-output')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/archivePreviewService.ts', 'electron/services/archivePreviewService.js'],
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
  await mkdir(tempOutputRoot, { recursive: true })
  await writeFile(path.join(tempSourceRoot, 'zhangsan-license.pdf'), 'source should remain', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'wangwu-license.pdf'), 'source should remain', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'multi.pdf'), 'source should remain', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'pending.txt'), 'source should remain', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'dup.pdf'), 'source should remain', 'utf8')
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
    throw new Error(`Electron archive preview verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { generateArchivePreview } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/archivePreviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);
      const preview = generateArchivePreview(db, ${JSON.stringify(tempOutputRoot)});

      assertEqual(preview.totalItems, 6, 'preview item count');
      assert(preview.reviewItems >= 4, 'review item count');
      assertEqual(preview.conflictItems, 2, 'conflict item count');

      const zhangsan = findByFile(preview, 'zhangsan-license.pdf');
      assertIncludes(zhangsan.targetRelativePath, path.join('工程', '成都', '张三_1234', '03_证书资料', 'zhangsan-license.pdf'), 'zhangsan target');
      assertEqual(zhangsan.needsReview, false, 'zhangsan review flag');

      const unknownRegion = findByFile(preview, 'wangwu-license.pdf');
      assertIncludes(unknownRegion.targetRelativePath, path.join('工程', '未划分区域', '王五_P000005'), 'unknown region target');
      assert(unknownRegion.reviewReasons.includes('地区未知'), 'unknown region review reason');

      const multi = findByFile(preview, 'multi.pdf');
      assertIncludes(multi.targetRelativePath, path.join('消防员', '绵阳', '_多人员资料', '多人员资料_multi', 'multi.pdf'), 'multi target');
      assertEqual(multi.isMultiPersonFile, true, 'multi flag');
      assert(multi.reviewReasons.includes('多人员资料'), 'multi review reason');

      const pending = findByFile(preview, 'pending.txt');
      assertIncludes(pending.targetRelativePath, path.join('未识别类别', '未划分区域', '未知人员_P000000', '99_待确认', 'pending.txt'), 'pending target');
      assert(pending.reviewReasons.includes('人员姓名未知'), 'pending person reason');
      assert(pending.reviewReasons.includes('资料类型未知'), 'pending document reason');

      const conflicts = preview.items.filter((item) => item.conflictReason === '多个文件将生成到同一目标路径');
      assertEqual(conflicts.length, 2, 'duplicate target conflicts');
      assert(conflicts.every((item) => item.needsReview), 'conflict items need review');

      assert(existsSync(${JSON.stringify(path.join(tempSourceRoot, 'zhangsan-license.pdf'))}), 'original source remains');

      console.log('verify:archive-preview passed');
    } finally {
      db.close();
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function seedDatabase(db) {
  insertPerson(db, 'person-1', '张三', '1234', '工程', '成都', 'suggested');
  insertPerson(db, 'person-5', '王五', null, '工程', null, 'pending_review');
  insertPerson(db, 'person-6', '钱七', '5566', '消防员', '绵阳', 'pending_review');
  insertFile(db, 'file-1', 'zhangsan-license.pdf', 0, 'ai_extracted');
  insertFile(db, 'file-2', 'wangwu-license.pdf', 0, 'needs_review');
  insertFile(db, 'file-3', 'multi.pdf', 1, 'needs_review');
  insertFile(db, 'file-4', 'pending.txt', 0, 'needs_review');
  insertFile(db, 'file-5', 'dup.pdf', 0, 'ai_extracted');
  insertFile(db, 'file-6', 'dup.pdf', 0, 'ai_extracted');
  insertDocument(db, 'doc-1', 'person-1', 'file-1', 'license', '工程', 'primary', 0, null);
  insertDocument(db, 'doc-2', 'person-5', 'file-2', 'license', '工程', 'primary', 1, '地区未知');
  insertDocument(db, 'doc-3', 'person-6', 'file-3', 'license', '消防员', 'multi_person', 1, '多人员资料');
  insertDocument(db, 'doc-4', null, 'file-4', 'unknown', null, 'primary', 1, '资料类型未知');
  insertDocument(db, 'doc-5', 'person-1', 'file-5', 'license', '工程', 'primary', 0, null);
  insertDocument(db, 'doc-6', 'person-1', 'file-6', 'license', '工程', 'primary', 0, null);
  insertLicense(db, 'license-1', 'person-1', 'file-1', '工程', '成都', '二级建造师', 0, 'suggested');
}

function insertPerson(db, id, name, idCardLast4, primaryCategory, region, reviewStatus) {
  db.prepare("insert into people (id, name, id_card_last4, primary_category, region, review_status, status, archive_dirty, created_at, updated_at) values (@id, @name, @idCardLast4, @primaryCategory, @region, @reviewStatus, 'active', 1, 'now', 'now')").run({
    id,
    name,
    idCardLast4,
    primaryCategory,
    region,
    reviewStatus,
  });
}

function insertFile(db, id, fileName, isMultiPersonFile, processStatus) {
  db.prepare("insert into files (id, original_path, file_name, process_status, archive_status, is_multi_person_file, created_at, updated_at) values (@id, @originalPath, @fileName, @processStatus, 'pending', @isMultiPersonFile, 'now', 'now')").run({
    id,
    originalPath: path.join(${JSON.stringify(tempSourceRoot)}, fileName),
    fileName,
    processStatus,
    isMultiPersonFile,
  });
}

function insertDocument(db, id, personId, fileId, documentType, targetCategory, relationType, needsReview, reviewReason) {
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values (@id, @personId, @fileId, @documentType, @targetCategory, @relationType, 0.9, @needsReview, @reviewReason, 'active', 'now', 'now')").run({
    id,
    personId,
    fileId,
    documentType,
    targetCategory,
    relationType,
    needsReview,
    reviewReason,
  });
}

function insertLicense(db, id, personId, fileId, primaryCategory, region, normalizedName, needsReview, status) {
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values (@id, @personId, @fileId, @primaryCategory, @detectedCategories, @region, @normalizedName, @status, @needsReview, 'active', 'now', 'now')").run({
    id,
    personId,
    fileId,
    primaryCategory,
    detectedCategories: JSON.stringify([primaryCategory]),
    region,
    normalizedName,
    needsReview,
    status,
  });
}

function findByFile(preview, fileName) {
  const item = preview.items.find((candidate) => candidate.targetPath.endsWith(fileName) && candidate.sourcePath.endsWith(fileName));
  assert(item, 'item not found: ' + fileName);
  return item;
}

function assertIncludes(actual, expected, message) {
  assert(String(actual).includes(expected), message + ': expected to include ' + expected + ', received ' + actual);
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
