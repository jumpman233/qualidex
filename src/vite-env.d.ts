/// <reference types="vite/client" />

interface AppInfo {
  name: string
  version: string
  platform: string
}

interface ScannedFile {
  path: string
  relativePath: string
  name: string
  ext: string
  sizeBytes: number
  modifiedAt: string
  isSupported: boolean
  id?: string
  sha256?: string | null
  importStatus?: 'new' | 'duplicate' | 'failed'
  processStatus?: string
  processError?: string | null
  ocrStatus?: string
  ocrTextPreview?: string
  aiStatus?: string
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
  errors: Array<{
    path: string
    message: string
  }>
  skippedDirectories: string[]
}

interface RecognitionReviewExportResult {
  outputPath: string
  rowCount: number
}

interface Window {
  qualidex: {
    getAppInfo(): Promise<AppInfo>
    selectSourceDirectory(): Promise<string | null>
    scanDirectory(directoryPath: string): Promise<DirectoryScanResult>
    exportRecognitionReviewExcel(): Promise<RecognitionReviewExportResult | null>
  }
}
