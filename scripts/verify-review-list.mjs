import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-review-list-'))
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
    throw new Error(`Electron review list verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { listReviewItems } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/reviewService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      seedDatabase(db);

      const items = listReviewItems(db, 20);
      assertEqual(items.length, 2, 'pending review item count');

      const conflict = items.find((item) => item.id === 'review-conflict');
      assert(conflict, 'conflict review exists');
      assertEqual(conflict.itemType, 'person_merge_conflict', 'conflict type');
      assertEqual(conflict.fileName, '张三冲突.pdf', 'conflict file name');
      assertEqual(conflict.personName, '张三', 'conflict person name');
      assertEqual(conflict.primaryCategory, '工程', 'conflict primary category');
      assertEqual(conflict.region, '成都', 'conflict region');
      assertEqual(conflict.documentType, 'license', 'conflict document type');
      assertEqual(conflict.licenseName, '二级建造师', 'conflict license name');
      assert(conflict.ocrTextPreview.includes('张三'), 'ocr preview');
      assert(conflict.aiSummary.includes('人员：张三'), 'ai summary person');
      assert(conflict.aiSummary.includes('置信度：64%'), 'ai summary confidence');

      const unknown = items.find((item) => item.id === 'review-unknown');
      assert(unknown, 'unknown review exists');
      assertEqual(unknown.fileName, '未知人员.txt', 'unknown file name');
      assertEqual(unknown.personName, null, 'unknown person');
      assertEqual(unknown.primaryCategory, null, 'unknown category');
      assertEqual(unknown.aiSummary, 'AI 抽取失败', 'unknown ai error');

      assert(!items.some((item) => item.id === 'review-confirmed'), 'confirmed item filtered');
      assert(!items.some((item) => item.id === 'review-deleted-file'), 'deleted file filtered');

      const limited = listReviewItems(db, 1);
      assertEqual(limited.length, 1, 'limit applies');

      console.log('verify:review-list passed');
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
  insertFile(db, 'file-conflict', '张三冲突.pdf', '姓名 张三 二级建造师 证书 地区 成都', 'ai_extracted', null);
  insertFile(db, 'file-unknown', '未知人员.txt', '无法识别人员，只看到证书复印件', 'ai_extract_failed', null);
  insertFile(db, 'file-confirmed', '已确认.pdf', '已确认文本', 'ai_extracted', null);
  insertFile(db, 'file-deleted', '已删除.pdf', '已删除文本', 'ai_extracted', 'deleted');

  insertPerson(db, 'person-1', '张三', '1234', '工程', '成都');
  insertDocument(db, 'doc-1', 'person-1', 'file-conflict', 'license', '工程', 1, '存在同名人员归并冲突');
  insertLicense(db, 'license-1', 'person-1', 'file-conflict', '工程', '成都', '二级建造师', 1);

  insertAiResult(db, 'ai-1', 'file-conflict', 'needs_review', createAiResultJson(), null, '2026-05-19T01:00:00.000Z');
  insertAiResult(db, 'ai-2', 'file-unknown', 'ai_extract_failed', null, 'AI 抽取失败', '2026-05-19T01:01:00.000Z');

  insertReview(db, 'review-conflict', 'person_merge_conflict', 'file-conflict', '存在同名人员归并冲突', 'pending', '2026-05-19T02:00:00.000Z');
  insertReview(db, 'review-unknown', 'person_unknown', 'file-unknown', '人员姓名未知', 'pending', '2026-05-19T01:59:00.000Z');
  insertReview(db, 'review-confirmed', 'region_unknown', 'file-confirmed', '地区未知', 'confirmed', '2026-05-19T01:58:00.000Z');
  insertReview(db, 'review-deleted-file', 'region_unknown', 'file-deleted', '地区未知', 'pending', '2026-05-19T01:57:00.000Z');
}

function insertFile(db, id, fileName, ocrText, processStatus, archiveStatus) {
  db.prepare("insert into files (id, original_path, file_name, ocr_text, ocr_status, process_status, archive_status, created_at, updated_at) values (@id, @originalPath, @fileName, @ocrText, 'text_extracted', @processStatus, @archiveStatus, 'now', 'now')").run({
    id,
    originalPath: 'fixture/' + fileName,
    fileName,
    ocrText,
    processStatus,
    archiveStatus: archiveStatus || 'pending',
  });
}

function insertPerson(db, id, name, idCardLast4, primaryCategory, region) {
  db.prepare("insert into people (id, name, id_card_last4, primary_category, region, review_status, status, archive_dirty, created_at, updated_at) values (@id, @name, @idCardLast4, @primaryCategory, @region, 'pending_review', 'active', 1, 'now', 'now')").run({
    id,
    name,
    idCardLast4,
    primaryCategory,
    region,
  });
}

function insertDocument(db, id, personId, fileId, documentType, targetCategory, needsReview, reviewReason) {
  db.prepare("insert into person_documents (id, person_id, file_id, document_type, target_category, relation_type, confidence, needs_review, review_reason, status, created_at, updated_at) values (@id, @personId, @fileId, @documentType, @targetCategory, 'primary', 0.64, @needsReview, @reviewReason, 'active', 'now', 'now')").run({
    id,
    personId,
    fileId,
    documentType,
    targetCategory,
    needsReview,
    reviewReason,
  });
}

function insertLicense(db, id, personId, fileId, primaryCategory, region, normalizedName, needsReview) {
  db.prepare("insert into licenses (id, person_id, file_id, primary_category, detected_categories, region, normalized_license_name, recognition_status, needs_review, status, created_at, updated_at) values (@id, @personId, @fileId, @primaryCategory, @detectedCategories, @region, @normalizedName, 'pending_review', @needsReview, 'active', 'now', 'now')").run({
    id,
    personId,
    fileId,
    primaryCategory,
    detectedCategories: JSON.stringify([primaryCategory]),
    region,
    normalizedName,
    needsReview,
  });
}

function insertAiResult(db, id, fileId, status, resultJson, error, createdAt) {
  db.prepare("insert into ai_extract_results (id, file_id, provider, model_name, status, confidence, needs_manual_review, review_reasons, result_json, error, created_at, updated_at) values (@id, @fileId, 'fixture', 'fixture-model', @status, 0.64, 1, @reviewReasons, @resultJson, @error, @createdAt, @createdAt)").run({
    id,
    fileId,
    status,
    resultJson,
    error,
    reviewReasons: JSON.stringify(['存在同名人员归并冲突']),
    createdAt,
  });
}

function insertReview(db, id, itemType, refId, reason, status, createdAt) {
  db.prepare("insert into review_items (id, item_type, ref_id, reason, status, suggested_value, confirmed_value, created_at, updated_at) values (@id, @itemType, @refId, @reason, @status, NULL, NULL, @createdAt, @createdAt)").run({
    id,
    itemType,
    refId,
    reason,
    status,
    createdAt,
  });
}

function createAiResultJson() {
  return JSON.stringify({
    person: { name: '张三' },
    category: { primary_value: '工程' },
    region: { value: '成都' },
    license: { normalized_license_name: '二级建造师' },
    confidence: 0.64,
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
