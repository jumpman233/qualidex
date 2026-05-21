import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-query-export-recycle-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/queryService.ts', 'electron/services/queryService.js'],
  ['electron/services/exportService.ts', 'electron/services/exportService.js'],
  ['electron/services/recycleService.ts', 'electron/services/recycleService.js'],
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
    throw new Error(`Electron query/export/recycle verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { mkdirSync, existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { readFile, utils } = require(${JSON.stringify(path.join(workspaceRoot, 'node_modules/xlsx'))});
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { queryPeople } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/queryService.js'))});
const {
  exportQueryResultsExcel,
  exportQueryResultFiles,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/exportService.js'))});
const {
  cleanupArchiveOutput,
  listDeletedItems,
  restoreFile,
  restorePerson,
  softDeleteFile,
  softDeletePerson,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/recycleService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});
    try {
      const sourceRoot = ${JSON.stringify(path.join(tempRoot, 'source'))};
      const outputRoot = ${JSON.stringify(path.join(tempRoot, 'export-output'))};
      const cleanupRoot = ${JSON.stringify(path.join(tempRoot, 'archive-output'))};
      mkdirSync(sourceRoot, { recursive: true });
      mkdirSync(outputRoot, { recursive: true });
      mkdirSync(cleanupRoot, { recursive: true });
      writeFileSync(path.join(sourceRoot, 'zhangsan-license.txt'), 'license');
      writeFileSync(path.join(sourceRoot, 'lisi-license.txt'), 'pending license');
      writeFileSync(path.join(sourceRoot, 'multi-person.pdf'), 'multi source');
      writeFileSync(path.join(cleanupRoot, 'copy.txt'), 'generated copy');

      seedDatabase(db, sourceRoot);

      const results = queryPeople(db, {
        categories: ['工程', '消防员'],
        region: '成都',
        licenseQuery: '二级',
      });
      assertEqual(results.length, 1, 'query result count');
      assertEqual(results[0].name, '张三', 'query result person');
      assertEqual(results[0].idCardNumber, '110101199003071234', 'query full id card');
      assertEqual(results[0].maskedDisplay, '1101**********1234', 'query masked id card');
      assert(results[0].licenseNames.includes('二级建造师'), 'query includes first license');
      assert(results[0].licenseNames.includes('安全员证'), 'query includes second license');
      assertEqual(results[0].documentCount, 2, 'query document count');

      const pendingExcluded = queryPeople(db, { categories: ['工程'], includePendingReview: false });
      assert(!pendingExcluded.some((person) => person.name === '李四'), 'pending person excluded');
      const pendingIncluded = queryPeople(db, { categories: ['工程'], includePendingReview: true });
      assert(pendingIncluded.some((person) => person.name === '李四'), 'pending person included');

      const excelPath = path.join(${JSON.stringify(tempRoot)}, 'query-results.xlsx');
      const excelResult = exportQueryResultsExcel(db, { categories: ['工程'], includePendingReview: true }, excelPath);
      assertEqual(excelResult.rowCount, 2, 'excel exported row count');
      assert(existsSync(excelPath), 'excel file exists');
      const maskedRows = readFirstSheet(excelPath);
      assertEqual(maskedRows[0]['身份证号'], '1101**********1234', 'default excel exports masked id card');
      assert(String(maskedRows[0]['证书']).includes('二级建造师'), 'default excel includes first license');
      assert(String(maskedRows[0]['证书']).includes('安全员证'), 'default excel includes second license');
      assert(!JSON.stringify(maskedRows).includes('110101199003071234'), 'default excel should not include full id card');

      const fullExcelPath = path.join(${JSON.stringify(tempRoot)}, 'query-results-full-id.xlsx');
      exportQueryResultsExcel(db, { categories: ['工程'], includePendingReview: true }, fullExcelPath, { exportFullIdCard: true });
      const fullRows = readFirstSheet(fullExcelPath);
      assertEqual(fullRows[0]['身份证号'], '110101199003071234', 'explicit excel exports full id card');
      const fullExportLog = db.prepare("select parsed_conditions from export_jobs where output_path = @outputPath").get({ outputPath: fullExcelPath });
      assertEqual(JSON.parse(fullExportLog.parsed_conditions).export_full_id_card, true, 'full id export flag logged');

      const filesResult = await exportQueryResultFiles(db, { categories: ['工程'] }, outputRoot);
      assertEqual(filesResult.copiedItems, 2, 'files copied count');
      const normalExport = filesResult.results.find((item) => item.fileId === 'file-1');
      assert(normalExport, 'normal export item exists');
      assert(normalExport.targetPath.startsWith(outputRoot), 'files copied inside output root');
      assert(normalExport.targetPath.includes('张三_1234'), 'file export folder uses name and last4');
      assert(!normalExport.targetPath.includes('110101199003071234'), 'file export path does not expose full id card');
      assert(existsSync(normalExport.targetPath), 'copied file exists');
      const multiExport = filesResult.results.find((item) => item.fileId === 'file-3');
      assert(multiExport, 'multi-person export item exists');
      assert(multiExport.targetPath.includes('_多人员资料'), 'multi-person export uses shared folder');
      assert(!multiExport.targetPath.includes('张三_1234'), 'multi-person export is not copied into person folder');

      const exportJobs = db.prepare('select count(*) as count from export_jobs').get();
      assertEqual(exportJobs.count, 3, 'export jobs recorded');

      const personDelete = softDeletePerson(db, 'person-1', 'test delete');
      assert(personDelete.auditLogId, 'person delete audit id');
      const deletedPerson = db.prepare("select status, deleted_at, archive_dirty from people where id = 'person-1'").get();
      assertEqual(deletedPerson.status, 'deleted', 'person soft deleted');
      assert(deletedPerson.deleted_at, 'person deleted at');
      assertEqual(deletedPerson.archive_dirty, 1, 'person dirty after delete');

      const fileDelete = softDeleteFile(db, 'file-1', 'test file delete');
      assert(fileDelete.auditLogId, 'file delete audit id');
      const deletedFile = db.prepare("select archive_status, deleted_at from files where id = 'file-1'").get();
      assertEqual(deletedFile.archive_status, 'deleted', 'file soft deleted');
      assert(deletedFile.deleted_at, 'file deleted at');

      const deletedItems = listDeletedItems(db, 20);
      assert(deletedItems.some((item) => item.itemType === 'person' && item.id === 'person-1'), 'deleted person listed');
      assert(deletedItems.some((item) => item.itemType === 'file' && item.id === 'file-1'), 'deleted file listed');

      restorePerson(db, 'person-1');
      restoreFile(db, 'file-1');
      const restoredPerson = db.prepare("select status, deleted_at from people where id = 'person-1'").get();
      const restoredFile = db.prepare("select archive_status, deleted_at from files where id = 'file-1'").get();
      assertEqual(restoredPerson.status, 'active', 'person restored');
      assertEqual(restoredPerson.deleted_at, null, 'person deleted_at cleared');
      assertEqual(restoredFile.archive_status, 'pending', 'file restored');
      assertEqual(restoredFile.deleted_at, null, 'file deleted_at cleared');

      const cleanupResult = await cleanupArchiveOutput(db, cleanupRoot);
      assertEqual(cleanupResult.removedEntries, 1, 'cleanup removed entries');
      assert(!existsSync(path.join(cleanupRoot, 'copy.txt')), 'archive output copy removed');
      assert(existsSync(path.join(sourceRoot, 'zhangsan-license.txt')), 'original source file preserved');

      console.log('verify:query-export-recycle passed');
    } finally {
      db.close();
    }
    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function seedDatabase(db, sourceRoot) {
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-1', @path, 'zhangsan-license.txt', 'text_extracted', 'completed', 'pending', 'now', 'now')").run({ path: path.join(sourceRoot, 'zhangsan-license.txt') });
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, created_at, updated_at) values ('file-2', @path, 'lisi-license.txt', 'text_extracted', 'needs_review', 'pending', 'now', 'now')").run({ path: path.join(sourceRoot, 'lisi-license.txt') });
  db.prepare("insert into files (id, original_path, file_name, ocr_status, process_status, archive_status, is_multi_person_file, created_at, updated_at) values ('file-3', @path, 'multi-person.pdf', 'text_extracted', 'completed', 'pending', 1, 'now', 'now')").run({ path: path.join(sourceRoot, 'multi-person.pdf') });
  db.prepare("insert into people (id, name, id_card_number, id_card_last4, masked_display, primary_category, region, education_level, review_status, status, archive_dirty, created_at, updated_at) values ('person-1', '张三', '110101199003071234', '1234', '1101**********1234', '工程', '成都', 'college', 'confirmed', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into people (id, name, id_card_number, id_card_last4, masked_display, primary_category, region, education_level, review_status, status, archive_dirty, created_at, updated_at) values ('person-2', '李四', '110101199105065678', '5678', '1101**********5678', '工程', '成都', 'bachelor', 'pending_review', 'active', 0, 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-1', 'person-1', 'file-1', 'license', '工程', 'primary', 1, 0, 'active', 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-2', 'person-2', 'file-2', 'license', '工程', 'primary', 0.5, 1, 'active', 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-3a', 'person-1', 'file-3', 'license', '工程', 'multi_person', 1, 0, 'active', 'now', 'now')").run();
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, status, created_at, updated_at) values ('doc-3b', 'person-2', 'file-3', 'license', '工程', 'multi_person', 1, 0, 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-1', 'person-1', 'file-1', '工程', '成都', '二级建造师', '二级建造师', 'confirmed', 0, 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-1b', 'person-1', 'file-1', '工程', '成都', '安全员证', '安全员证', 'confirmed', 0, 'active', 'now', 'now')").run();
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, region, raw_license_name, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values ('license-2', 'person-2', 'file-2', '工程', '成都', '二级建造师', '二级建造师', 'pending_review', 1, 'active', 'now', 'now')").run();
}

function readFirstSheet(workbookPath) {
  const workbook = readFile(workbookPath);
  return utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
}

function assert(condition, message) {
  if (!condition) throw new Error('Assertion failed: ' + message);
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + ': expected ' + expected + ', received ' + actual);
}
`
}
