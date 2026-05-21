import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-import-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const fullImportRoot = path.join(tempRoot, 'full-source')
const addFolderRoot = path.join(tempRoot, 'add-folder')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/hashService.ts', 'electron/services/hashService.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
  ['electron/services/pathSemanticService.ts', 'electron/services/pathSemanticService.js'],
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
  ['electron/services/processingQueueService.ts', 'electron/services/processingQueueService.js'],
  ['electron/services/importService.ts', 'electron/services/importService.js'],
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
  await mkdir(path.join(fullImportRoot, '工程', '成都'), { recursive: true })
  await mkdir(path.join(addFolderRoot, '新增'), { recursive: true })
  await writeFile(path.join(fullImportRoot, 'alpha.txt'), 'alpha content', 'utf8')
  await writeFile(path.join(fullImportRoot, '工程', '成都', 'beta.txt'), 'beta content', 'utf8')
  await writeFile(path.join(addFolderRoot, 'alpha-copy.txt'), 'alpha content', 'utf8')
  await writeFile(path.join(addFolderRoot, '新增', 'gamma.txt'), 'gamma content', 'utf8')
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
    throw new Error(`Electron import verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  importDirectory,
  listImportBatches,
  rescanDirectory,
  rescanImportBatch,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/importService.js'))});

process.env.APP_ROOT = ${JSON.stringify(tempRoot)};
delete process.env.AI_PROVIDER;
delete process.env.AI_BASE_URL;
delete process.env.AI_MODEL_NAME;
delete process.env.AI_API_KEY;
delete process.env.AI_SAMPLE_ACCEPTANCE_RATE;
delete process.env.AI_USE_JSON_RESPONSE_FORMAT;

app.whenReady().then(async () => {
  try {
    const legacyDbPath = ${JSON.stringify(path.join(tempRoot, 'legacy.sqlite'))};
    createLegacyDatabase(legacyDbPath);
    const migratedDb = openQualidexDatabase(legacyDbPath);
    try {
      const fileColumns = migratedDb.prepare('PRAGMA table_info(files)').all().map((row) => row.name);
      assert(fileColumns.includes('folder_merge_key'), 'legacy files table migrated folder_merge_key');
      assert(fileColumns.includes('folder_merge_result'), 'legacy files table migrated folder_merge_result');
      assert(fileColumns.includes('folder_merge_confidence'), 'legacy files table migrated folder_merge_confidence');
      assert(fileColumns.includes('path_parse_result'), 'legacy files table migrated path_parse_result');
      const folderMergeIndexes = migratedDb
        .prepare("PRAGMA index_list('files')")
        .all()
        .filter((row) => row.name === 'idx_files_folder_merge_key');
      assertEqual(folderMergeIndexes.length, 1, 'legacy files table folder merge index');
    } finally {
      migratedDb.close();
    }

    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      const firstImport = await importDirectory(db, ${JSON.stringify(fullImportRoot)}, {
        batchType: 'full_import',
        defaultPrimaryCategory: '工程',
        defaultRegion: '成都',
      });
      assertEqual(firstImport.totalFiles, 2, 'first import total files');
      assertEqual(firstImport.newFiles, 2, 'first import new files');
      assertEqual(firstImport.duplicateFiles, 0, 'first import duplicate files');
      assertEqual(firstImport.failedFiles, 0, 'first import failed files');

      const addFolderImport = await importDirectory(db, ${JSON.stringify(addFolderRoot)}, {
        batchType: 'add_folder',
        defaultPrimaryCategory: '环境',
        defaultRegion: '重庆',
      });
      assertEqual(addFolderImport.totalFiles, 2, 'add-folder total files');
      assertEqual(addFolderImport.newFiles, 1, 'add-folder new files');
      assertEqual(addFolderImport.duplicateFiles, 1, 'add-folder duplicate files');

      const rescanImport = await importDirectory(db, ${JSON.stringify(fullImportRoot)}, {
        batchType: 'rescan',
        rescanMode: 'all_files',
      });
      assertEqual(rescanImport.totalFiles, 2, 'rescan total files');
      assertEqual(rescanImport.newFiles, 0, 'rescan new files');
      assertEqual(rescanImport.duplicateFiles, 2, 'rescan duplicate files');

      const listedBatches = listImportBatches(db, 10);
      assertEqual(listedBatches.length, 3, 'listed batch rows');
      assertEqual(listedBatches[0].batchType, 'rescan', 'latest listed batch type');
      assertEqual(listedBatches[1].batchType, 'add_folder', 'second latest listed batch type');
      assertEqual(listedBatches[2].batchType, 'full_import', 'oldest listed batch type');

      const batchRescan = await rescanImportBatch(db, listedBatches[2].id, {
        rescanMode: 'all_files',
      });
      assertEqual(batchRescan.totalFiles, 2, 'batch rescan total files');
      assertEqual(batchRescan.newFiles, 0, 'batch rescan new files');
      assertEqual(batchRescan.duplicateFiles, 2, 'batch rescan duplicate files');

      const directoryRescan = await rescanDirectory(db, ${JSON.stringify(addFolderRoot)}, {
        rescanMode: 'all_files',
      });
      assertEqual(directoryRescan.totalFiles, 2, 'directory rescan total files');
      assertEqual(directoryRescan.newFiles, 0, 'directory rescan new files');
      assertEqual(directoryRescan.duplicateFiles, 2, 'directory rescan duplicate files');

      await assertRejects(
        () => rescanImportBatch(db, 'missing-batch-id'),
        'missing batch should reject',
      );

      const batches = db.prepare(
        'select batch_type, default_primary_category, default_region from import_batches order by created_at asc'
      ).all();
      assertEqual(batches.length, 5, 'batch rows');
      assertEqual(batches[0].batch_type, 'full_import', 'first batch type');
      assertEqual(batches[0].default_primary_category, '工程', 'first default primary category');
      assertEqual(batches[0].default_region, '成都', 'first default region');
      assertEqual(batches[1].batch_type, 'add_folder', 'second batch type');
      assertEqual(batches[1].default_primary_category, '环境', 'second default primary category');
      assertEqual(batches[1].default_region, '重庆', 'second default region');
      assertEqual(batches[2].batch_type, 'rescan', 'third batch type');
      assertEqual(batches[3].batch_type, 'rescan', 'fourth batch type');
      assertEqual(batches[3].default_primary_category, '工程', 'batch rescan preserved default primary category');
      assertEqual(batches[3].default_region, '成都', 'batch rescan preserved default region');
      assertEqual(batches[4].batch_type, 'rescan', 'fifth batch type');

      const nestedFile = db.prepare(
        "select relative_path, path_segments, path_parse_result, path_confidence from files where file_name = 'beta.txt' limit 1"
      ).get();
      assert(Boolean(nestedFile), 'nested file row exists');
      assertEqual(nestedFile.relative_path, ${JSON.stringify(path.join('工程', '成都', 'beta.txt'))}, 'relative path');
      assertEqual(JSON.parse(nestedFile.path_segments).join('/'), '工程/成都/beta.txt', 'path segments');
      const pathParseResult = JSON.parse(nestedFile.path_parse_result);
      assertEqual(pathParseResult.candidate_primary_category, '工程', 'path primary category');
      assertEqual(pathParseResult.candidate_region, '成都', 'path region');
      assert(pathParseResult.evidence.some((item) => item.includes('工程')), 'path evidence category');
      assert(nestedFile.path_confidence > 0, 'path confidence recorded');

      const fileCount = db.prepare('select count(*) as count from files').get().count;
      const duplicateCount = db
        .prepare("select count(*) as count from files where process_status = 'duplicate'")
        .get().count;
      const taskCount = db.prepare('select count(*) as count from processing_tasks').get().count;
      const duplicatePreview = addFolderImport.files.find((file) => file.importStatus === 'duplicate');
      assertEqual(fileCount, 3, 'file rows only include new unique files');
      assertEqual(duplicateCount, 0, 'duplicate files are not persisted');
      assertEqual(taskCount, 3, 'processing tasks are only created for new unique files');
      assert(Boolean(duplicatePreview), 'duplicate preview row exists');
      assert(String(duplicatePreview.id).startsWith('duplicate:'), 'duplicate preview id is not a database file id');
      assertEqual(duplicatePreview.processStatus, 'skipped', 'duplicate preview process status');
      assertEqual(duplicatePreview.ocrStatus, 'skipped', 'duplicate preview OCR status');
      assertEqual(duplicatePreview.aiStatus, 'skipped', 'duplicate preview AI status');

      assert(require('node:fs').existsSync(${JSON.stringify(path.join(fullImportRoot, 'alpha.txt'))}), 'original full import file remains');
      assert(require('node:fs').existsSync(${JSON.stringify(path.join(addFolderRoot, '新增', 'gamma.txt'))}), 'original add-folder file remains');

      console.log('verify:import-batches passed');
    } finally {
      db.close();
    }

    app.quit();
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});

function assert(condition, message) {
  if (!condition) {
    throw new Error('Assertion failed: ' + message);
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, message + ': expected ' + expected + ', received ' + actual);
}

async function assertRejects(fn, message) {
  try {
    await fn();
  } catch {
    return;
  }

  throw new Error('Assertion failed: ' + message);
}

function createLegacyDatabase(databasePath) {
  const Database = require('better-sqlite3');
  const db = new Database(databasePath);
  try {
    db.exec(\`
      CREATE TABLE files (
        id TEXT PRIMARY KEY,
        original_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        ext TEXT,
        size_bytes INTEGER,
        sha256 TEXT,
        mime_type TEXT,
        source_batch_id TEXT,
        source_root_path TEXT,
        parent_folder TEXT,
        ocr_text TEXT,
        ocr_status TEXT,
        process_status TEXT,
        process_error TEXT,
        archive_status TEXT DEFAULT 'pending',
        is_multi_person_file INTEGER DEFAULT 0,
        deleted_at TEXT,
        deleted_reason TEXT,
        created_at TEXT,
        updated_at TEXT
      );
    \`);
  } finally {
    db.close();
  }
}
`
}
