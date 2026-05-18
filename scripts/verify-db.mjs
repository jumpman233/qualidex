import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-db-'))
const tempModuleRoot = path.join(tempRoot, 'modules')
const tempSourceRoot = path.join(tempRoot, 'scan-source')
const tempElectronApp = path.join(tempRoot, 'electron-app')

const modules = [
  ['electron/db/schema.ts', 'electron/db/schema.js'],
  ['electron/db/connection.ts', 'electron/db/connection.js'],
  ['electron/services/hashService.ts', 'electron/services/hashService.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
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
  await writeFile(path.join(tempSourceRoot, 'alpha.txt'), 'same content', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'nested', 'alpha-copy.txt'), 'same content', 'utf8')
  await writeFile(path.join(tempSourceRoot, 'nested', 'beta.pdf'), 'different content', 'utf8')
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
    throw new Error(`Electron DB verifier failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function getElectronVerifierSource() {
  return `
const { app } = require('electron');
const { openQualidexDatabase } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/db/connection.js'))});
const { importDirectory } = require(${JSON.stringify(path.join(tempModuleRoot, 'electron/services/importService.js'))});

app.whenReady().then(async () => {
  try {
    const db = openQualidexDatabase(${JSON.stringify(path.join(tempRoot, 'qualidex.sqlite'))});

    try {
      const version = db.prepare('select vec_version() as version').get().version;
      assert(typeof version === 'string' && version.length > 0, 'sqlite-vec should load');

      const firstImport = await importDirectory(db, ${JSON.stringify(tempSourceRoot)});
      assertEqual(firstImport.totalFiles, 3, 'first import total files');
      assertEqual(firstImport.newFiles, 2, 'first import new files');
      assertEqual(firstImport.duplicateFiles, 1, 'first import duplicate files');
      assertEqual(firstImport.failedFiles, 0, 'first import failed files');

      const secondImport = await importDirectory(db, ${JSON.stringify(tempSourceRoot)});
      assertEqual(secondImport.totalFiles, 3, 'second import total files');
      assertEqual(secondImport.newFiles, 0, 'second import new files');
      assertEqual(secondImport.duplicateFiles, 3, 'second import duplicate files');
      assertEqual(secondImport.failedFiles, 0, 'second import failed files');

      const batchCount = db.prepare('select count(*) as count from import_batches').get().count;
      const fileCount = db.prepare('select count(*) as count from files').get().count;
      const duplicateCount = db
        .prepare("select count(*) as count from files where process_status = 'duplicate'")
        .get().count;

      assertEqual(batchCount, 2, 'import batch rows');
      assertEqual(fileCount, 6, 'file rows');
      assertEqual(duplicateCount, 4, 'duplicate file rows');

      console.log('verify:db passed');
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
