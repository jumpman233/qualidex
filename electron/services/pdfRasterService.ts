import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

export interface PdfRasterOptions {
  dpi?: number
  maxPages?: number
}

export interface PdfRasterResult {
  imagePaths: string[]
  warnings: string[]
}

interface PopplerCommandResult {
  stdout: string
  stderr: string
}

interface PopplerConfig {
  executablePath: string
  dpi: number
  maxPages: number
}

const DEFAULT_DPI = 300
const DEFAULT_MAX_PAGES = 20
const RASTER_TIMEOUT_MS = 120_000
const TEXT_TIMEOUT_MS = 60_000

export async function extractPdfTextLayer(pdfPath: string): Promise<string> {
  const executableName = process.platform === 'win32' ? 'pdftotext.exe' : 'pdftotext'
  const executablePath = resolvePopplerExecutable(executableName)
  const result = await runPoppler(
    executablePath,
    ['-enc', 'UTF-8', '-layout', '-nopgbrk', pdfPath, '-'],
    {
      label: 'PDF 文本层提取',
      timeoutMs: TEXT_TIMEOUT_MS,
      executableName,
    },
  )

  return result.stdout
}

export async function rasterizePdfPages(
  pdfPath: string,
  outputDirectory: string,
  options: PdfRasterOptions = {},
): Promise<PdfRasterResult> {
  const config = loadPopplerConfig(options)
  const outputPrefix = path.join(outputDirectory, 'page')

  await mkdir(outputDirectory, { recursive: true })
  await runPoppler(config.executablePath, [
    '-r',
    String(config.dpi),
    '-png',
    '-f',
    '1',
    '-l',
    String(config.maxPages),
    pdfPath,
    outputPrefix,
  ], {
    label: 'PDF 转图片',
    timeoutMs: RASTER_TIMEOUT_MS,
    executableName: process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm',
  })

  const imagePaths = readdirSync(outputDirectory)
    .filter((fileName) => /^page-\d+\.png$/i.test(fileName))
    .sort(comparePageImageName)
    .map((fileName) => path.join(outputDirectory, fileName))

  if (imagePaths.length === 0) {
    throw new Error('PDF 转图片未生成页面图片，请检查 Poppler 是否可用或 PDF 是否有效。')
  }

  return {
    imagePaths,
    warnings: imagePaths.length >= config.maxPages ? [`PDF OCR 已按最大页数 ${config.maxPages} 截断。`] : [],
  }
}

function loadPopplerConfig(options: PdfRasterOptions): PopplerConfig {
  const env = loadEnvironment()
  const executableName = process.platform === 'win32' ? 'pdftoppm.exe' : 'pdftoppm'
  const executablePath = resolvePopplerExecutable(executableName, env)
  const dpi = parsePositiveInteger(env.PDF_OCR_DPI, options.dpi ?? DEFAULT_DPI)
  const maxPages = parsePositiveInteger(env.PDF_OCR_MAX_PAGES, options.maxPages ?? DEFAULT_MAX_PAGES)

  return {
    executablePath,
    dpi,
    maxPages,
  }
}

function resolvePopplerExecutable(executableName: string, env = loadEnvironment()): string {
  const binDirectory = env.POPPLER_BIN_DIR?.trim()
  const bundledExecutablePath = resolveBundledPopplerExecutable(executableName)
  const executablePath = binDirectory
    ? path.join(binDirectory, executableName)
    : bundledExecutablePath ?? executableName

  if (binDirectory && !existsSync(executablePath)) {
    throw new Error(`Poppler 未找到：${executablePath}。请检查 POPPLER_BIN_DIR。`)
  }

  return executablePath
}

function resolveBundledPopplerExecutable(executableName: string): string | null {
  const workspaceRoot = resolveWorkspaceRoot()
  const candidates = [
    process.platform === 'win32'
      ? path.join(workspaceRoot, 'node_modules', 'pdf-poppler', 'lib', 'win', 'poppler-0.51', 'bin', executableName)
      : null,
    process.platform === 'darwin'
      ? path.join(workspaceRoot, 'node_modules', 'pdf-poppler', 'lib', 'osx', 'poppler-0.66', 'bin', executableName)
      : null,
  ].filter((candidate): candidate is string => Boolean(candidate))

  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function loadEnvironment(): Record<string, string | undefined> {
  return {
    ...readLocalEnv(path.join(resolveWorkspaceRoot(), '.env.local')),
    ...process.env,
  }
}

function readLocalEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {}
  }

  const content = readFileSync(envPath, 'utf8')
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const value = trimmedLine.slice(separatorIndex + 1).trim()
    values[key] = stripQuotes(value)
  }

  return values
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }

  return parsed
}

function runPoppler(
  executablePath: string,
  args: string[],
  options: { label: string; timeoutMs: number; executableName: string },
): Promise<PopplerCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, {
      windowsHide: true,
    })

    let stderr = ''
    let stdout = ''
    let settled = false

    const timeout = setTimeout(() => {
      settled = true
      child.kill()
      reject(new Error(`${options.label}超时：${options.timeoutMs / 1000}s`))
    }, options.timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(`未找到 Poppler 的 ${options.executableName}。请安装 Poppler，或使用项目依赖中的 pdf-poppler，并在 .env.local 中配置 POPPLER_BIN_DIR。`))
        return
      }
      reject(new Error(`启动 Poppler ${options.executableName} 失败：${error.message}`))
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)

      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }

      const details = stderr.trim() || stdout.trim()
      reject(new Error(`${options.label}失败，退出码 ${code ?? 'unknown'}${details ? `：${details.slice(0, 500)}` : ''}`))
    })
  })
}

function comparePageImageName(left: string, right: string): number {
  return getPageNumber(left) - getPageNumber(right)
}

function getPageNumber(fileName: string): number {
  const match = fileName.match(/page-(\d+)\.png$/i)
  return match ? Number.parseInt(match[1], 10) : 0
}

function resolveWorkspaceRoot(): string {
  if (process.env.APP_ROOT) {
    return process.env.APP_ROOT
  }

  return process.cwd()
}
