import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const fixtureRoot = path.join(workspaceRoot, 'test-fixtures', 'scan-source')
const servicePath = path.join(workspaceRoot, 'electron', 'services', 'fileScanner.ts')

const tempRoot = await mkdtemp(path.join(tmpdir(), 'qualidex-scan-'))
const tempModulePath = path.join(tempRoot, 'fileScanner.mjs')
const tempScanRoot = path.join(tempRoot, 'scan-source')

try {
  await buildScannerModule()
  await cp(fixtureRoot, tempScanRoot, { recursive: true })
  await createSkippedDirectorySamples(tempScanRoot)

  const { scanDirectory } = await import(pathToFileURL(tempModulePath).href)
  const result = await scanDirectory(tempScanRoot)

  assertEqual(result.totalFiles, 4, 'total file count')
  assertEqual(result.supportedFiles, 3, 'supported file count')
  assertEqual(result.unsupportedFiles, 1, 'unsupported file count')
  assertEqual(result.errors.length, 0, 'scan error count')
  assertEqual(result.skippedDirectories.length, 3, 'skipped directory count')
  assert(result.totalBytes > 0, 'totalBytes should be greater than zero')

  const relativePaths = result.files.map((file) => normalizePath(file.relativePath)).sort()
  assertIncludes(relativePaths, 'nested/license.pdf', 'nested PDF fixture')
  assertIncludes(relativePaths, 'nested/photo.JPG', 'nested image fixture')
  assertIncludes(relativePaths, 'notes.md', 'unsupported markdown fixture')
  assertIncludes(relativePaths, 'root.txt', 'root text fixture')

  const photo = result.files.find((file) => normalizePath(file.relativePath) === 'nested/photo.JPG')
  assert(photo?.isSupported === true, 'uppercase JPG extension should be supported')

  const markdown = result.files.find((file) => normalizePath(file.relativePath) === 'notes.md')
  assert(markdown?.isSupported === false, 'markdown should be marked unsupported')

  console.log('verify:scan passed')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

async function buildScannerModule() {
  const source = await readFile(servicePath, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      strict: true,
    },
  })

  await writeFile(tempModulePath, output.outputText, 'utf8')
}

async function createSkippedDirectorySamples(rootPath) {
  const skippedDirectories = ['.git', 'node_modules', 'dist']

  for (const directoryName of skippedDirectories) {
    const directoryPath = path.join(rootPath, directoryName)
    await mkdir(directoryPath, { recursive: true })
    await writeFile(path.join(directoryPath, 'ignored.txt'), 'ignored by scanner', 'utf8')
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, received ${actual}`)
}

function assertIncludes(values, expected, message) {
  assert(values.includes(expected), `${message}: missing ${expected}`)
}
