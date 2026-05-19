import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-queue-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/processingQueueService.ts', 'electron/services/processingQueueService.js'],
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
    throw new Error(`Electron processing queue verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const {
  claimNextProcessingTask,
  completeProcessingTask,
  createProcessingTask,
  failProcessingTask,
  listProcessingTasks,
  skipProcessingTask,
} = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/processingQueueService.js'))});

process.env.APP_ROOT = ${JSON.stringify(tempRoot)};

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      db.prepare("insert into import_batches (id, batch_type, source_path, status, created_at, updated_at) values ('batch-1', 'full_import', 'fixture', 'running', 'now', 'now')").run();
      db.prepare("insert into files (id, original_path, file_name, created_at, updated_at) values ('file-1', 'fixture/a.txt', 'a.txt', 'now', 'now')").run();

      const first = createProcessingTask(db, {
        taskType: 'ocr',
        fileId: 'file-1',
        batchId: 'batch-1',
        priority: 10,
      });
      const second = createProcessingTask(db, {
        taskType: 'ai_extract',
        fileId: 'file-1',
        batchId: 'batch-1',
        priority: 1,
      });

      assertEqual(first.status, 'pending', 'new OCR task status');
      assertEqual(second.status, 'pending', 'new AI task status');

      const claimed = claimNextProcessingTask(db, 'ocr');
      assert(claimed, 'should claim OCR task');
      assertEqual(claimed.id, first.id, 'claimed task id');
      assertEqual(claimed.status, 'running', 'claimed task status');
      assertEqual(claimed.attempts, 1, 'claimed attempts');

      const completed = completeProcessingTask(db, claimed.id, 'text_extracted');
      assertEqual(completed.status, 'completed', 'completed task status');
      assertEqual(completed.resultSummary, 'text_extracted', 'completed result summary');

      const failed = failProcessingTask(db, second.id, 'AI config missing');
      assertEqual(failed.status, 'failed', 'failed task status');
      assertEqual(failed.error, 'AI config missing', 'failed task error');

      const skipped = createProcessingTask(db, {
        taskType: 'archive',
        fileId: 'file-1',
        batchId: 'batch-1',
      });
      const skippedResult = skipProcessingTask(db, skipped.id, 'archive not requested');
      assertEqual(skippedResult.status, 'skipped', 'skipped task status');

      const allTasks = listProcessingTasks(db, 10);
      const pendingTasks = listProcessingTasks(db, 10, 'pending');

      assertEqual(allTasks.length, 3, 'all task count');
      assertEqual(pendingTasks.length, 0, 'pending task count');

      console.log('verify:processing-queue passed');
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
