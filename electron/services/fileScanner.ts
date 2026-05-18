import { opendir, stat } from 'node:fs/promises'
import path from 'node:path'

const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
])

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  'dist',
  'dist-electron',
])

export interface ScannedFile {
  path: string
  relativePath: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
  isSupported: boolean
}

export interface ScanError {
  path: string
  message: string
}

export interface DirectoryScanResult {
  rootPath: string
  totalFiles: number
  supportedFiles: number
  unsupportedFiles: number
  totalBytes: number
  files: ScannedFile[]
  errors: ScanError[]
  skippedDirectories: string[]
}

export interface DirectoryScanOptions {
  maxPreviewFiles?: number
}

export async function scanDirectory(
  rootPath: string,
  options: DirectoryScanOptions = {},
): Promise<DirectoryScanResult> {
  const resolvedRoot = path.resolve(rootPath)
  const rootStats = await stat(resolvedRoot)

  if (!rootStats.isDirectory()) {
    throw new Error('Selected path is not a directory')
  }

  const result: DirectoryScanResult = {
    rootPath: resolvedRoot,
    totalFiles: 0,
    supportedFiles: 0,
    unsupportedFiles: 0,
    totalBytes: 0,
    files: [],
    errors: [],
    skippedDirectories: [],
  }

  const maxPreviewFiles = options.maxPreviewFiles ?? 200

  async function walk(currentPath: string) {
    let directory

    try {
      directory = await opendir(currentPath)
    } catch (error) {
      result.errors.push({
        path: currentPath,
        message: getErrorMessage(error),
      })
      return
    }

    for await (const entry of directory) {
      const entryPath = path.join(currentPath, entry.name)

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          result.skippedDirectories.push(entryPath)
          continue
        }

        await walk(entryPath)
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      try {
        const fileStats = await stat(entryPath)
        const ext = path.extname(entry.name).toLowerCase()
        const isSupported = SUPPORTED_EXTENSIONS.has(ext)

        result.totalFiles += 1
        result.totalBytes += fileStats.size

        if (isSupported) {
          result.supportedFiles += 1
        } else {
          result.unsupportedFiles += 1
        }

        if (result.files.length < maxPreviewFiles) {
          result.files.push({
            path: entryPath,
            relativePath: path.relative(resolvedRoot, entryPath),
            name: entry.name,
            ext,
            sizeBytes: fileStats.size,
            modifiedAt: fileStats.mtime.toISOString(),
            isSupported,
          })
        }
      } catch (error) {
        result.errors.push({
          path: entryPath,
          message: getErrorMessage(error),
        })
      }
    }
  }

  await walk(resolvedRoot)

  result.files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  result.skippedDirectories.sort((left, right) => left.localeCompare(right))

  return result
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
