import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-person-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/reviewService.ts', 'electron/services/reviewService.js'],
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
    throw new Error(`Electron review person verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  listPersonCandidates,
  reassignReviewFilePerson,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const candidates = listPersonCandidates(db, '李四', 10);
      assertEqual(candidates.length, 1, 'candidate count');
      assertEqual(candidates[0].id, 'person-new', 'candidate id');
      assertEqual(candidates[0].documentCount, 0, 'candidate document count before reassign');

      const result = reassignReviewFilePerson(db, 'review-1', 'person-new');
      assert(result.auditLogId, 'audit id');
      assertEqual(result.reviewItem.personId, 'person-new', 'summary person id');
      assertEqual(result.reviewItem.personName, '李四', 'summary person name');

      const document = db.prepare("select person_id from person_documents where id = 'doc-1'").get();
      assertEqual(document.person_id, 'person-new', 'document reassigned');

      const license = db.prepare("select person_id, primary_category, region from licenses where id = 'license-1'").get();
      assertEqual(license.person_id, 'person-new', 'license reassigned');
      assertEqual(license.primary_category, '工程', 'license keeps category when already set');
      assertEqual(license.region, '成都', 'license keeps region when already set');

      const oldPerson = db.prepare("select archive_dirty from people where id = 'person-old'").get();
      const newPerson = db.prepare("select archive_dirty from people where id = 'person-new'").get();
      assertEqual(oldPerson.archive_dirty, 1, 'old person dirty');
      assertEqual(newPerson.archive_dirty, 1, 'new person dirty');

      const audit = db.prepare("select action, target_type, target_id, before_value, after_value, reason from audit_logs where id = @id").get({ id: result.auditLogId });
      assertEqual(audit.action, '更换资料关联人员', 'audit action');
      assertEqual(audit.target_type, 'review_item', 'audit target type');
      assertEqual(audit.target_id, 'review-1', 'audit target id');
      assertIncludes(audit.before_value, 'person-old', 'audit before old person');
      assertIncludes(audit.after_value, 'person-new', 'audit after new person');
      assertIncludes(audit.reason, 'person-new', 'audit reason');

      let deletedFailed = false;
      try {
        reassignReviewFilePerson(db, 'review-1', 'person-deleted');
      } catch (error) {
        deletedFailed = String(error.message).includes('不存在或已删除');
      }
      assert(deletedFailed, 'deleted person rejected');

      console.log('verify:review-person-reassign passed');
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
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-1', 'fixture/zhangsan.pdf', 'zhangsan.pdf', 'text_extracted', 'needs_review', 'pending', 'now', 'now')").run();
  insertPerson(db, 'person-old', '张三', '1234', '工程', '成都', 'active', null, 0);
  insertPerson(db, 'person-new', '李四', '5678', '工程', '绵阳', 'active', null, 0);
  insertPerson(db, 'person-deleted', '王五', '9999', '工程', '成都', 'active', 'now', 0);
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values ('doc-1', 'person-old', 'file-1', 'license', '工程', 'primary', 0.6, 1, '人员冲突', 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-1', 'person-old', 'file-1', '工程', @detectedCategories, '成都', '二级建造师', 'pending_review', 1, 'active', 'now', 'now')").run({
    detectedCategories: JSON.stringify(['工程']),
  });
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values ('review-1', 'person_merge_conflict', 'file-1', '存在同名人员归并冲突', 'pending', NULL, NULL, 'now', 'now')").run();
}

function insertPerson(db, id, name, idCardLast4, primaryCategory, region, status, deletedAt, archiveDirty) {
  db.prepare("insert into people (id, name, id_card_last4, primary_category, region, review_status, status, archive_dirty, deleted_at, created_at, updated_at) values (@id, @name, @idCardLast4, @primaryCategory, @region, 'pending_review', @status, @archiveDirty, @deletedAt, 'now', 'now')").run({
    id,
    name,
    idCardLast4,
    primaryCategory,
    region,
    status,
    deletedAt,
    archiveDirty,
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

function assertIncludes(actual, expected, message) {
  assert(String(actual).includes(expected), message + ': expected to include ' + expected + ', received ' + actual);
}
`
}
