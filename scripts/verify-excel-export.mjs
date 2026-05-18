import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-excel-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/exportService.ts', 'electron/services/exportService.js'],
]

try {
  await buildModules()
  await createElectronVerifier()
  runElectronVerifier()
} finally {
  // await rm(tempRoot, { recursive: true, force: true })
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
    throw new Error(`Electron Excel verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const path = require('node:path');
const { app } = require('electron');
const XLSX = require('xlsx');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { exportRecognitionReviewExcel } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/exportService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});
    const outputPath = ${JSON.stringify(path.join(tempRoot, 'recognition-review.xlsx'))};

    try {
      seedDatabase(db);
      const result = exportRecognitionReviewExcel(db, outputPath);
      assertEqual(result.rowCount, 1, 'exported row count');

      const workbook = XLSX.readFile(outputPath);
      const sheet = workbook.Sheets['识别验收'];
      assert(Boolean(sheet), '识别验收 sheet should exist');

      const rows = XLSX.utils.sheet_to_json(sheet);
      assertEqual(rows.length, 1, 'worksheet row count');
      assertEqual(rows[0]['姓名'], '杜海全', 'person name');
      assertEqual(rows[0]['身份证后四位'], '2111', 'id card last4');
      assertEqual(rows[0]['AI状态'], 'needs_review', 'AI status');
      assert(String(rows[0]['待确认原因']).includes('地区未知'), 'review reason');

      console.log('verify:excel-export passed');
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
  const now = new Date().toISOString();
  const fileId = 'file-1';
  db.prepare(\`
    INSERT INTO files (
      id,
      original_path,
      file_name,
      ext,
      size_bytes,
      sha256,
      parent_folder,
      ocr_text,
      ocr_status,
      process_status,
      process_error,
      archive_status,
      created_at,
      updated_at
    )
    VALUES (
      @id,
      @originalPath,
      @fileName,
      '.jpg',
      1024,
      'hash-1',
      'private',
      @ocrText,
      'ocr_completed',
      'needs_review',
      NULL,
      'pending',
      @now,
      @now
    )
  \`).run({
    id: fileId,
    originalPath: 'E:/samples/id-card.jpg',
    fileName: '杜海全-身份证1.jpg',
    ocrText: '姓名杜海全\\\\n公民身份号码142701197606032111',
    now,
  });

  db.prepare(\`
    INSERT INTO ai_extract_results (
      id,
      file_id,
      provider,
      model_name,
      status,
      confidence,
      needs_manual_review,
      review_reasons,
      result_json,
      error,
      created_at,
      updated_at
    )
    VALUES (
      'ai-1',
      @fileId,
      'volcengine',
      'doubao-lite',
      'needs_review',
      0.76,
      1,
      @reviewReasons,
      @resultJson,
      NULL,
      @now,
      @now
    )
  \`).run({
    fileId,
    reviewReasons: JSON.stringify(['地区未知或置信度低']),
    resultJson: JSON.stringify({
      document_type: 'id_card',
      person: {
        name: '杜海全',
        id_card_last4: '2111',
      },
      category: {
        primary_value: '工程',
        candidate_values: ['工程'],
        confidence: 0.9,
      },
      region: {
        value: null,
        confidence: 0.2,
      },
      education: {},
      license: {},
      multi_person: {
        is_multi_person_file: false,
      },
      evidence: ['OCR 中出现姓名和身份证号'],
    }),
    now,
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
