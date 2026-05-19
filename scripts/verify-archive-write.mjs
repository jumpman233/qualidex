import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-archive-write-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempSourceRoot = path.join(tempRoot, 'source')
const tempOutputRoot = path.join(tempRoot, 'archive-output')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/archivePreviewService.ts', 'electron/services/archivePreviewService.js'],
  ['electron/services/archiveWriterService.ts', 'electron/services/archiveWriterService.js'],
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
  await writeFile(path.join(tempSourceRoot, 'safe.pdf'), 'safe source', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'review.pdf'), 'review source', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'dup.pdf'), 'dup source', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'existing.pdf'), 'existing source', 'utf8')
  await mkdir(path.join(tempOutputRoot, '工程', '成都', '张三_1234', '03_证书资料'), { recursive: true })
  await writeFile(
    path.join(tempOutputRoot, '工程', '成都', '张三_1234', '03_证书资料', 'existing.pdf'),
    'existing target',
    'utf8',
  )
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
    throw new Error(`Electron archive write verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { writeArchiveFromPreview } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/archiveWriterService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);
      const result = await writeArchiveFromPreview(db, ${JSON.stringify(tempOutputRoot)});

      assertEqual(result.totalItems, 5, 'write item count');
      assertEqual(result.copiedItems, 1, 'copied item count');
      assertEqual(result.skippedReviewItems, 1, 'skipped review count');
      assertEqual(result.skippedConflictItems, 2, 'skipped conflict count');
      assertEqual(result.skippedExistingItems, 1, 'skipped existing count');
      assertEqual(result.failedItems, 0, 'failed count');

      const copiedPath = path.join(${JSON.stringify(tempOutputRoot)}, '工程', '成都', '张三_1234', '03_证书资料', 'safe.pdf');
      assert(existsSync(copiedPath), 'safe file copied');
      assertEqual(readFileSync(copiedPath, 'utf8'), 'safe source', 'copied file content');

      const reviewTarget = path.join(${JSON.stringify(tempOutputRoot)}, '工程', '成都', '张三_1234', '99_待确认', 'review.pdf');
      assert(!existsSync(reviewTarget), 'review file skipped');

      const conflictTarget = path.join(${JSON.stringify(tempOutputRoot)}, '工程', '成都', '张三_1234', '03_证书资料', 'dup.pdf');
      assert(!existsSync(conflictTarget), 'conflict files skipped');

      const existingTarget = path.join(${JSON.stringify(tempOutputRoot)}, '工程', '成都', '张三_1234', '03_证书资料', 'existing.pdf');
      assertEqual(readFileSync(existingTarget, 'utf8'), 'existing target', 'existing target not overwritten');

      const safeDoc = db.prepare("select target_path from person_documents where file_id = 'file-safe'").get();
      const reviewDoc = db.prepare("select target_path from person_documents where file_id = 'file-review'").get();
      const safeFile = db.prepare("select archive_status from files where id = 'file-safe'").get();
      const reviewFile = db.prepare("select archive_status from files where id = 'file-review'").get();

      assertEqual(safeDoc.target_path, copiedPath, 'safe document target path');
      assertEqual(reviewDoc.target_path, null, 'review document target path untouched');
      assertEqual(safeFile.archive_status, 'archived', 'safe file archive status');
      assertEqual(reviewFile.archive_status, 'pending', 'review file archive status');
      assert(existsSync(${JSON.stringify(path.join(tempSourceRoot, 'safe.pdf'))}), 'original safe source remains');
      assertEqual(readFileSync(${JSON.stringify(path.join(tempSourceRoot, 'safe.pdf'))}, 'utf8'), 'safe source', 'original source content unchanged');

      console.log('verify:archive-write passed');
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
  insertFile(db, 'file-safe', 'safe.pdf', 'safe source');
  insertFile(db, 'file-review', 'review.pdf', 'review source');
  insertFile(db, 'file-dup-a', 'dup.pdf', 'dup source');
  insertFile(db, 'file-dup-b', 'dup.pdf', 'dup source');
  insertFile(db, 'file-existing', 'existing.pdf', 'existing source');
  insertDocument(db, 'doc-safe', 'file-safe', 0, null);
  insertDocument(db, 'doc-review', 'file-review', 1, '证书识别需要确认');
  insertDocument(db, 'doc-dup-a', 'file-dup-a', 0, null);
  insertDocument(db, 'doc-dup-b', 'file-dup-b', 0, null);
  insertDocument(db, 'doc-existing', 'file-existing', 0, null);
  insertLicense(db, 'license-safe', 'file-safe', 0, 'suggested');
  insertLicense(db, 'license-existing', 'file-existing', 0, 'suggested');
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

function insertFile(db, id, fileName) {
  db.prepare("insert into files (id, original_path, file_name, process_status, archive_status, is_multi_person_file, created_at, updated_at) values (@id, @originalPath, @fileName, 'ai_extracted', 'pending', 0, 'now', 'now')").run({
    id,
    originalPath: path.join(${JSON.stringify(tempSourceRoot)}, fileName),
    fileName,
  });
}

function insertDocument(db, id, fileId, needsReview, reviewReason) {
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values (@id, 'person-1', @fileId, 'license', '工程', 'primary', 0.9, @needsReview, @reviewReason, 'active', 'now', 'now')").run({
    id,
    fileId,
    needsReview,
    reviewReason,
  });
}

function insertLicense(db, id, fileId, needsReview, status) {
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values (@id, 'person-1', @fileId, '工程', @detectedCategories, '成都', '二级建造师', @status, @needsReview, 'active', 'now', 'now')").run({
    id,
    fileId,
    detectedCategories: JSON.stringify(['工程']),
    needsReview,
    status,
  });
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
