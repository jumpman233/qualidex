/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

interface ScannedFile {
  id?: string
  path: string
  relativePath: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
  isSupported: boolean
  sha256?: string | null
  importStatus?: 'new' | 'duplicate' | 'failed'
  processStatus?: string
  processError?: string | null
}

interface ScanError {
  path: string
  message: string
}

interface DirectoryScanResult {
  batchId?: string
  rootPath: string
  totalFiles: number
  supportedFiles: number
  unsupportedFiles: number
  totalBytes: number
  newFiles?: number
  duplicateFiles?: number
  failedFiles?: number
  files: ScannedFile[]
  errors: ScanError[]
  skippedDirectories: string[]
}

// Used in Renderer process, exposed in `preload.ts`.
interface Window {
  qualidex: {
    getAppInfo(): Promise<AppInfo>
    selectSourceDirectory(): Promise<string | null>
    scanDirectory(directoryPath: string): Promise<DirectoryScanResult>
  }
}
