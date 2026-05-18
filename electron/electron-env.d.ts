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
  path: string
  relativePath: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
  isSupported: boolean
}

interface ScanError {
  path: string
  message: string
}

interface DirectoryScanResult {
  rootPath: string
  totalFiles: number
  supportedFiles: number
  unsupportedFiles: number
  totalBytes: number
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
