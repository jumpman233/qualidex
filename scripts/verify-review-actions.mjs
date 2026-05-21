import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-actions-'))
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
    throw new Error(`Electron review actions verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  confirmReviewItem,
  ignoreReviewItem,
  listReviewItems,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const before = listReviewItems(db, 20);
      assertEqual(before.length, 2, 'pending count before actions');

      const confirmResult = confirmReviewItem(db, 'review-confirm', JSON.stringify({ primaryCategory: '工程' }));
      assertEqual(confirmResult.reviewItem.status, 'confirmed', 'confirmed status');
      assert(confirmResult.auditLogId, 'confirm audit id');

      const confirmedRow = db.prepare("select status, confirmed_value from review_items where id = 'review-confirm'").get();
      assertEqual(confirmedRow.status, 'confirmed', 'confirmed row status');
      assertIncludes(confirmedRow.confirmed_value, '工程', 'confirmed value');

      const confirmAudit = db.prepare("select action, target_type, target_id, after_value from audit_logs where id = @id").get({ id: confirmResult.auditLogId });
      assertEqual(confirmAudit.action, '确认待确认项', 'confirm audit action');
      assertEqual(confirmAudit.target_type, 'review_item', 'confirm audit target type');
      assertEqual(confirmAudit.target_id, 'review-confirm', 'confirm audit target id');
      assertIncludes(confirmAudit.after_value, 'confirmed', 'confirm audit after value');

      const dirtyPerson = db.prepare("select archive_dirty from people where id = 'person-1'").get();
      assertEqual(dirtyPerson.archive_dirty, 1, 'related person marked dirty');

      const ignoreResult = ignoreReviewItem(db, 'review-ignore', '不是目标资料');
      assertEqual(ignoreResult.reviewItem.status, 'ignored', 'ignored status');
      assert(ignoreResult.auditLogId, 'ignore audit id');

      const ignoredRow = db.prepare("select status, confirmed_value from review_items where id = 'review-ignore'").get();
      assertEqual(ignoredRow.status, 'ignored', 'ignored row status');
      assertEqual(ignoredRow.confirmed_value, '不是目标资料', 'ignored reason');

      const pendingAfter = listReviewItems(db, 20);
      assertEqual(pendingAfter.length, 0, 'pending count after actions');

      let doubleConfirmFailed = false;
      try {
        confirmReviewItem(db, 'review-confirm', null);
      } catch (error) {
        doubleConfirmFailed = String(error.message).includes('已处理');
      }
      assert(doubleConfirmFailed, 'processed review item cannot be processed again');

      console.log('verify:review-actions passed');
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
  insertFile(db, 'file-1', '张三证书.pdf');
  insertFile(db, 'file-2', '李四证书.pdf');
  insertPerson(db, 'person-1', '张三');
  insertPerson(db, 'person-2', '李四');
  insertDocument(db, 'doc-1', 'person-1', 'file-1');
  insertDocument(db, 'doc-2', 'person-2', 'file-2');
  insertReview(db, 'review-confirm', 'region_unknown', 'file-1', '地区未知');
  insertReview(db, 'review-ignore', 'person_unknown', 'file-2', '人员未知');
}

function insertFile(db, id, fileName) {
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values (@id, @originalPath, @fileName, 'text_extracted', 'needs_review', 'pending', 'now', 'now')").run({
    id,
    originalPath: 'fixture/' + fileName,
    fileName,
  });
}

function insertPerson(db, id, name) {
  db.prepare("insert into people (id, name, primary_category, region, review_status, status, archive_dirty, created_at, updated_at) values (@id, @name, '工程', '成都', 'pending_review', 'active', 0, 'now', 'now')").run({
    id,
    name,
  });
}

function insertDocument(db, id, personId, fileId) {
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values (@id, @personId, @fileId, 'license', '工程', 'primary', 0.6, 1, '待确认', 'active', 'now', 'now')").run({
    id,
    personId,
    fileId,
  });
}

function insertReview(db, id, itemType, refId, reason) {
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values (@id, @itemType, @refId, @reason, 'pending', NULL, NULL, 'now', 'now')").run({
    id,
    itemType,
    refId,
    reason,
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
