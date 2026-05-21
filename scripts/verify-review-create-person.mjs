import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-create-person-'))
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
    throw new Error(`Electron review create-person verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  createPersonFromReviewItem,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const result = createPersonFromReviewItem(db, 'review-1', {
        name: 'Li Si',
        idCardLast4: '12xX',
        primaryCategory: 'firefighter',
        region: 'region-b',
      });

      assert(result.auditLogId, 'audit id');
      assert(result.reviewItem.personId, 'summary person id');
      assertEqual(result.reviewItem.personName, 'Li Si', 'summary person name');

      const person = db.prepare("select id, name, id_card_last4, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty from people where name = 'Li Si'").get();
      assert(person.id, 'created person id');
      assertEqual(person.id_card_last4, '12XX', 'normalized id card last4');
      assertEqual(person.primary_category, 'firefighter', 'created person category');
      assertEqual(person.primary_category_source, 'manual', 'created person category source');
      assertEqual(person.primary_category_confidence, 1, 'created person category confidence');
      assertEqual(person.region, 'region-b', 'created person region');
      assertEqual(person.region_source, 'manual', 'created person region source');
      assertEqual(person.region_confidence, 1, 'created person region confidence');
      assertEqual(person.review_status, 'confirmed', 'created person review status');
      assertEqual(person.status, 'active', 'created person active status');
      assertEqual(person.archive_dirty, 1, 'created person archive dirty');

      const document = db.prepare("select person_id, target_category from person_documents where id = 'doc-1'").get();
      assertEqual(document.person_id, person.id, 'document reassigned');
      assertEqual(document.target_category, 'engineering', 'existing document category preserved');

      const license = db.prepare("select person_id, primary_category, region from licenses where id = 'license-1'").get();
      assertEqual(license.person_id, person.id, 'license reassigned');
      assertEqual(license.primary_category, 'engineering', 'existing license category preserved');
      assertEqual(license.region, 'region-a', 'existing license region preserved');

      const oldPerson = db.prepare("select archive_dirty from people where id = 'person-old'").get();
      assertEqual(oldPerson.archive_dirty, 1, 'old person archive dirty');

      const audit = db.prepare("select action, before_value, after_value, reason from audit_logs where id = @id").get({ id: result.auditLogId });
      assertEqual(audit.action, '从待确认项新建人员', 'audit action');
      assertIncludes(audit.before_value, 'person-old', 'audit before old person');
      assertIncludes(audit.after_value, 'Li Si', 'audit after created person');
      assertIncludes(audit.reason, 'firefighter', 'audit reason input');

      let invalidLast4Failed = false;
      try {
        createPersonFromReviewItem(db, 'review-1', { name: 'Bad Last4', idCardLast4: '12345' });
      } catch (error) {
        invalidLast4Failed = String(error.message).includes('身份证后四位');
      }
      assert(invalidLast4Failed, 'invalid id card last4 rejected');

      console.log('verify:review-create-person passed');
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
  db.prepare("insert into people (id, name, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty, created_at, updated_at) values ('person-old', 'Unknown', 'engineering', 'ai', 0.6, 'region-a', 'ai', 0.6, 'pending_review', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values ('doc-1', 'person-old', 'file-1', 'license', 'engineering', 'primary', 0.6, 1, 'person unknown', 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-1', 'person-old', 'file-1', 'engineering', @detectedCategories, 'region-a', 'second-builder', 'second-builder', 'pending_review', 1, 'active', 'now', 'now')").run({
    detectedCategories: JSON.stringify(['engineering']),
  });
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values ('review-1', 'person_unknown', 'file-1', 'person unknown', 'pending', NULL, NULL, 'now', 'now')").run();
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
