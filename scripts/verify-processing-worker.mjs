import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-worker-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempSourceRoot = path.join(tempRoot, 'scan-source')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/hashService.ts', 'electron/services/hashService.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/aiExtractService.ts', 'electron/services/aiExtractService.js'],
  ['electron/services/structuredRecognitionService.ts', 'electron/services/structuredRecognitionService.js'],
  ['electron/services/processingQueueService.ts', 'electron/services/processingQueueService.js'],
  ['electron/services/processingWorkerService.ts', 'electron/services/processingWorkerService.js'],
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
  await mkdir(path.join(tempSourceRoot, 'nested'), { recursive: true })
  await writeFile(path.join(tempSourceRoot, 'alpha.txt'), '姓名 张三\n二级建造师', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'nested', 'beta.txt'), '姓名 李四\n安全员证书', 'utf8')
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
    throw new Error(`Electron processing worker verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { existsSync } = require('node:fs');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { importDirectory } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/importService.js'))});
const { listProcessingTasks } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/processingQueueService.js'))});
const {
  executeNextProcessingTask,
  executeProcessingBatch,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/processingWorkerService.js'))});

process.env.APP_ROOT = ${JSON.stringify(tempRoot)};
delete process.env.AI_PROVIDER;
delete process.env.AI_BASE_URL;
delete process.env.AI_MODEL_NAME;
delete process.env.AI_API_KEY;
delete process.env.AI_SAMPLE_ACCEPTANCE_RATE;
delete process.env.AI_USE_JSON_RESPONSE_FORMAT;

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      const imported = await importDirectory(db, ${JSON.stringify(tempSourceRoot)}, {
        defaultPrimaryCategory: '工程',
        defaultRegion: '成都',
      });

      assertEqual(imported.totalFiles, 2, 'import total files');
      assertEqual(imported.newFiles, 2, 'import new files');
      assertEqual(imported.files[0].processStatus, 'pending_ocr', 'import preview process status');

      const pendingOcrBefore = listProcessingTasks(db, 10, 'pending')
        .filter((task) => task.taskType === 'ocr');
      assertEqual(pendingOcrBefore.length, 2, 'pending OCR tasks before worker');

      const importedFile = db.prepare("select ocr_text, ocr_status, process_status from files where file_name = 'alpha.txt'").get();
      assertEqual(importedFile.ocr_text, null, 'OCR text is empty before worker');
      assertEqual(importedFile.ocr_status, 'pending', 'OCR status before worker');

      const firstWorkerResult = await executeNextProcessingTask(db, 'ocr');
      assert(firstWorkerResult.task, 'single worker should process one task');
      assertEqual(firstWorkerResult.task.status, 'completed', 'single worker completed OCR task');
      assert(firstWorkerResult.createdTask, 'single OCR worker should create AI task');
      assertEqual(firstWorkerResult.createdTask.status, 'pending', 'created AI task status');

      const batchResult = await executeProcessingBatch(db, 10);
      assertEqual(batchResult.maxTasks, 10, 'batch max tasks');
      assertEqual(batchResult.processedTasks, 3, 'batch processed remaining tasks');
      assertEqual(batchResult.completedTasks, 1, 'batch completed tasks');
      assertEqual(batchResult.skippedTasks, 2, 'batch skipped tasks');
      assertEqual(batchResult.failedTasks, 0, 'batch failed tasks');
      assertEqual(batchResult.remainingPendingTasks, 0, 'batch remaining pending');

      const emptyBatchResult = await executeProcessingBatch(db, 10);
      assertEqual(emptyBatchResult.processedTasks, 0, 'empty batch processed tasks');
      assertEqual(emptyBatchResult.remainingPendingTasks, 0, 'empty batch remaining pending');

      const emptyNextResult = await executeNextProcessingTask(db);
      assertEqual(emptyNextResult.task, null, 'empty next task');

      const pendingAfter = listProcessingTasks(db, 20, 'pending');
      const runningAfter = listProcessingTasks(db, 20, 'running');
      assertEqual(pendingAfter.length, 0, 'pending tasks after worker loop');
      assertEqual(runningAfter.length, 0, 'running tasks after worker loop');

      const completedOcr = db.prepare("select count(*) as count from processing_tasks where task_type = 'ocr' and status = 'completed'").get().count;
      const skippedAi = db.prepare("select count(*) as count from processing_tasks where task_type = 'ai_extract' and status = 'skipped'").get().count;
      assertEqual(completedOcr, 2, 'completed OCR task count');
      assertEqual(skippedAi, 2, 'skipped AI task count without config');

      const processedFile = db.prepare("select ocr_text, ocr_status, process_status, process_error from files where file_name = 'alpha.txt'").get();
      assert(String(processedFile.ocr_text).includes('张三'), 'OCR text should be persisted');
      assertEqual(processedFile.ocr_status, 'text_extracted', 'OCR status after worker');
      assertEqual(processedFile.process_status, 'ai_skipped', 'AI status without config');
      assert(String(processedFile.process_error).includes('AI'), 'AI skip reason should be stored');

      const aiResultCount = db.prepare('select count(*) as count from ai_extract_results').get().count;
      assertEqual(aiResultCount, 0, 'AI result rows without config');

      assert(existsSync(${JSON.stringify(path.join(tempSourceRoot, 'alpha.txt'))}), 'original file remains');

      console.log('verify:processing-worker passed');
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
`
}
