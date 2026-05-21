import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-license-'))
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
    throw new Error(`Electron review license verifier failed with exit code ${result.status ?? 'unknown'}`)
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
        licenseName: 'first-class-builder',
        licenseRecognitionStatus: 'confirmed',
      });

      assert(result.auditLogId, 'audit id');
      assertEqual(result.reviewItem.licenseName, 'first-class-builder', 'summary license name');
      assertEqual(result.reviewItem.licenseRecognitionStatus, 'confirmed', 'summary recognition status');
      assertEqual(result.reviewItem.licenseNeedsReview, false, 'summary review flag');

      const license = db.prepare("select normalized_license_name, raw_license_name, license_search_text, recognition_status, recognition_reason, issuer_authority_review_status, needs_review from licenses where id = 'license-1'").get();
      assertEqual(license.normalized_license_name, 'first-class-builder', 'license normalized name');
      assertEqual(license.raw_license_name, 'second-builder', 'existing raw license name is preserved');
      assertEqual(license.license_search_text, 'first-class-builder', 'license search text');
      assertEqual(license.recognition_status, 'confirmed', 'license recognition status');
      assertEqual(license.recognition_reason, null, 'confirmed recognition reason');
      assertEqual(license.issuer_authority_review_status, 'confirmed', 'issuer authority review status');
      assertEqual(license.needs_review, 0, 'license review flag');

      const person = db.prepare("select archive_dirty from people where id = 'person-1'").get();
      assertEqual(person.archive_dirty, 1, 'person archive dirty');

      const audit = db.prepare("select before_value, after_value, reason from audit_logs where id = @id").get({ id: result.auditLogId });
      assertIncludes(audit.before_value, 'second-builder', 'audit before license name');
      assertIncludes(audit.after_value, 'first-class-builder', 'audit after license name');
      assertIncludes(audit.reason, 'licenseRecognitionStatus', 'audit reason patch');

      const pending = listReviewItems(db, 20);
      assertEqual(pending.length, 1, 'review item remains pending after license edit');
      assertEqual(pending[0].licenseName, 'first-class-builder', 'pending summary license name');
      assertEqual(pending[0].licenseRecognitionStatus, 'confirmed', 'pending summary recognition status');

      let invalidStatusFailed = false;
      try {
        updateReviewFields(db, 'review-1', { licenseRecognitionStatus: 'unknown_status' });
      } catch (error) {
        invalidStatusFailed = String(error.message).includes('证书认可状态');
      }
      assert(invalidStatusFailed, 'invalid recognition status rejected');

      console.log('verify:review-license-update passed');
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
  db.prepare("insert into people (id, name, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty, created_at, updated_at) values ('person-1', 'Zhang San', 'engineering', 'ai', 0.6, 'region-a', 'ai', 0.6, 'pending_review', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values ('doc-1', 'person-1', 'file-1', 'license', 'engineering', 'primary', 0.6, 1, 'license review', 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, raw_license_name, normalized_license_name, recognition_status, recognition_reason, issuer_authority_review_status, needs_review, status, created_at, updated_at) values ('license-1', 'person-1', 'file-1', 'engineering', @detectedCategories, 'region-a', 'second-builder', 'second-builder', 'pending_review', 'low confidence', 'pending_review', 1, 'active', 'now', 'now')").run({
    detectedCategories: JSON.stringify(['engineering']),
  });
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values ('review-1', 'license_recognition_uncertain', 'file-1', 'license uncertain', 'pending', NULL, NULL, 'now', 'now')").run();
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
