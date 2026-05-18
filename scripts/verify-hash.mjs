import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const servicePath = path.join(workspaceRoot, 'electron', 'services', 'hashService.ts')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'qualidex-hash-'))
const tempModulePath = path.join(tempRoot, 'hashService.mjs')

try {
  await buildHashModule()

  const first = path.join(tempRoot, 'first.txt')
  const second = path.join(tempRoot, 'second.txt')
  const different = path.join(tempRoot, 'different.txt')

  await writeFile(first, 'same content', 'utf8')
  await writeFile(second, 'same content', 'utf8')
  await writeFile(different, 'different content', 'utf8')

  const { calculateFileSha256 } = await import(pathToFileURL(tempModulePath).href)
  const firstHash = await calculateFileSha256(first)
  const secondHash = await calculateFileSha256(second)
  const differentHash = await calculateFileSha256(different)

  assert(firstHash === secondHash, 'same content should produce identical sha256')
  assert(firstHash !== differentHash, 'different content should produce different sha256')
  assert(firstHash.length === 64, 'sha256 should be 64 hex characters')

  console.log('verify:hash passed')
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

async function buildHashModule() {
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}
