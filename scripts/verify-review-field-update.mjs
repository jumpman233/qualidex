import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-field-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
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
    throw new Error(`Electron review field verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  listReviewItems,
  updateReviewFields,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const result = updateReviewFields(db, 'review-1', {
        primaryCategory: '消防员',
        region: '绵阳',
        documentType: 'other',
      });

      assert(result.auditLogId, 'audit id');
      assertEqual(result.reviewItem.primaryCategory, '消防员', 'summary primary category');
      assertEqual(result.reviewItem.region, '绵阳', 'summary region');
      assertEqual(result.reviewItem.documentType, 'other', 'summary document type');

      const person = db.prepare("select primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, archive_dirty from people where id = 'person-1'").get();
      assertEqual(person.primary_category, '消防员', 'person primary category');
      assertEqual(person.primary_category_source, 'manual', 'person category source');
      assertEqual(person.primary_category_confidence, 1, 'person category confidence');
      assertEqual(person.region, '绵阳', 'person region');
      assertEqual(person.region_source, 'manual', 'person region source');
      assertEqual(person.region_confidence, 1, 'person region confidence');
      assertEqual(person.archive_dirty, 1, 'person archive dirty');

      const document = db.prepare("select target_category, document_type from person_documents where id = 'doc-1'").get();
      assertEqual(document.target_category, '消防员', 'document target category');
      assertEqual(document.document_type, 'other', 'document type');

      const license = db.prepare("select primary_category, region from licenses where id = 'license-1'").get();
      assertEqual(license.primary_category, '消防员', 'license primary category');
      assertEqual(license.region, '绵阳', 'license region');

      const audit = db.prepare("select action, target_type, target_id, before_value, after_value, reason from audit_logs where id = @id").get({ id: result.auditLogId });
      assertEqual(audit.action, '修改待确认字段', 'audit action');
      assertEqual(audit.target_type, 'review_item', 'audit target type');
      assertEqual(audit.target_id, 'review-1', 'audit target id');
      assertIncludes(audit.before_value, '工程', 'audit before value');
      assertIncludes(audit.after_value, '消防员', 'audit after value');
      assertIncludes(audit.reason, 'documentType', 'audit reason patch');

      const pending = listReviewItems(db, 20);
      assertEqual(pending.length, 1, 'review item remains pending after field edit');
      assertEqual(pending[0].primaryCategory, '消防员', 'pending summary updated');

      let emptyPatchFailed = false;
      try {
        updateReviewFields(db, 'review-1', {});
      } catch (error) {
        emptyPatchFailed = String(error.message).includes('没有可保存');
      }
      assert(emptyPatchFailed, 'empty patch rejected');

      console.log('verify:review-field-update passed');
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
  db.prepare("insert into people (id, name, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty, created_at, updated_at) values ('person-1', '张三', '工程', 'ai', 0.6, '成都', 'ai', 0.6, 'pending_review', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values ('doc-1', 'person-1', 'file-1', 'license', '工程', 'primary', 0.6, 1, '地区未知', 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-1', 'person-1', 'file-1', '工程', @detectedCategories, '成都', '二级建造师', 'pending_review', 1, 'active', 'now', 'now')").run({
    detectedCategories: JSON.stringify(['工程']),
  });
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values ('review-1', 'region_unknown', 'file-1', '地区未知', 'pending', NULL, NULL, 'now', 'now')").run();
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
