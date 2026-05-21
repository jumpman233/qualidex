import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-people-merge-'))
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
    throw new Error(`Electron people merge verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  listPersonCandidates,
  mergePeople,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const result = mergePeople(db, {
        targetPersonId: 'person-target',
        sourcePersonIds: ['person-source'],
        reason: 'same person confirmed by user',
      });

      assert(result.auditLogId, 'audit id');
      assertEqual(result.targetPerson.id, 'person-target', 'target person id');
      assertEqual(result.mergedSourcePersonIds.length, 1, 'merged source count');
      assertEqual(result.movedDocumentCount, 2, 'moved document count');
      assertEqual(result.movedLicenseCount, 1, 'moved license count');

      const source = db.prepare("select status, deleted_at, deleted_reason, archive_dirty from people where id = 'person-source'").get();
      assertEqual(source.status, 'merged', 'source status');
      assert(source.deleted_at, 'source deleted_at');
      assertIncludes(source.deleted_reason, 'person-target', 'source deleted reason');
      assertEqual(source.archive_dirty, 1, 'source archive dirty');

      const target = db.prepare("select archive_dirty from people where id = 'person-target'").get();
      assertEqual(target.archive_dirty, 1, 'target archive dirty');

      const sourceDocuments = db.prepare("select count(*) as count from person_documents where person_id = 'person-source'").get();
      const targetDocuments = db.prepare("select count(*) as count from person_documents where person_id = 'person-target'").get();
      assertEqual(sourceDocuments.count, 0, 'source documents moved');
      assertEqual(targetDocuments.count, 3, 'target documents include moved');

      const sourceLicenses = db.prepare("select count(*) as count from licenses where person_id = 'person-source'").get();
      const targetLicenses = db.prepare("select count(*) as count from licenses where person_id = 'person-target'").get();
      assertEqual(sourceLicenses.count, 0, 'source licenses moved');
      assertEqual(targetLicenses.count, 2, 'target licenses include moved');

      const activeCandidates = listPersonCandidates(db, '', 20);
      assert(!activeCandidates.some((person) => person.id === 'person-source'), 'merged source hidden from candidates');
      assert(activeCandidates.some((person) => person.id === 'person-target'), 'target remains candidate');

      const audit = db.prepare("select action, target_type, target_id, before_value, after_value, reason from audit_logs where id = @id").get({ id: result.auditLogId });
      assertEqual(audit.action, '合并人员', 'audit action');
      assertEqual(audit.target_type, 'person', 'audit target type');
      assertEqual(audit.target_id, 'person-target', 'audit target id');
      assertIncludes(audit.before_value, 'doc-source-1', 'audit before source document');
      assertIncludes(audit.after_value, 'doc-source-1', 'audit after moved document');
      assertIncludes(audit.reason, 'same person confirmed by user', 'audit reason');

      let samePersonFailed = false;
      try {
        mergePeople(db, { targetPersonId: 'person-target', sourcePersonIds: ['person-target'] });
      } catch (error) {
        samePersonFailed = String(error.message).includes('至少一个不同');
      }
      assert(samePersonFailed, 'same target/source rejected');

      console.log('verify:people-merge passed');
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
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-target', 'fixture/target.pdf', 'target.pdf', 'text_extracted', 'completed', 'pending', 'now', 'now')").run();
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-source-1', 'fixture/source1.pdf', 'source1.pdf', 'text_extracted', 'completed', 'pending', 'now', 'now')").run();
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-source-2', 'fixture/source2.pdf', 'source2.pdf', 'text_extracted', 'completed', 'pending', 'now', 'now')").run();
  db.prepare("insert into people (id, name, id_card_last4, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty, created_at, updated_at) values ('person-target', 'Zhang San', '1234', 'engineering', 'manual', 1, 'region-a', 'manual', 1, 'confirmed', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into people (id, name, id_card_last4, primary_category, primary_category_source, primary_category_confidence, region, region_source, region_confidence, review_status, status, archive_dirty, created_at, updated_at) values ('person-source', 'Zhang San', '1234', 'engineering', 'ai', 0.6, 'region-a', 'ai', 0.6, 'pending_review', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-target', 'person-target', 'file-target', 'id_card', 'engineering', 'primary', 1, 0, 'active', 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-source-1', 'person-source', 'file-source-1', 'license', 'engineering', 'primary', 0.6, 1, 'active', 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-source-2', 'person-source', 'file-source-2', 'diploma', 'engineering', 'primary', 0.6, 1, 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-target', 'person-target', 'file-target', 'engineering', @detectedCategories, 'region-a', 'id-card', 'id-card', 'confirmed', 0, 'active', 'now', 'now')").run({ detectedCategories: JSON.stringify(['engineering']) });
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-source', 'person-source', 'file-source-1', 'engineering', @detectedCategories, 'region-a', 'builder', 'builder', 'pending_review', 1, 'active', 'now', 'now')").run({ detectedCategories: JSON.stringify(['engineering']) });
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
