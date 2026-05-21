import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { openQualidexDatabase } from './db/connection'
import {
  importDirectory,
  listImportBatches,
  rescanDirectory,
  rescanImportBatch,
} from './services/importService'
import {
  exportQueryResultFiles,
  exportQueryResultsExcel,
  exportRecognitionReviewExcel,
  type QueryResultsExcelExportOptions,
} from './services/exportService'
import { queryPeople, type QueryPeopleConditions } from './services/queryService'
import {
  cleanupArchiveOutput,
  listDeletedItems,
  restoreFile,
  restorePerson,
  softDeleteFile,
  softDeletePerson,
} from './services/recycleService'
import {
  listProcessingTasks,
  type ProcessingTaskStatus,
  type ProcessingTaskType,
} from './services/processingQueueService'
import {
  executeNextProcessingTask,
  executeProcessingBatch,
} from './services/processingWorkerService'
import { generateArchivePreview } from './services/archivePreviewService'
import { writeArchiveFromPreview } from './services/archiveWriterService'
import {
  confirmReviewItem,
  createPersonFromReviewItem,
  ignoreReviewItem,
  listPersonCandidates,
  listReviewItems,
  mergePeople,
  reassignReviewFilePerson,
  updateReviewFields,
  type CreatePersonFromReviewInput,
  type MergePeopleInput,
  type ReviewFieldPatch,
} from './services/reviewService'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let db: Database.Database | null = null

function getDatabase() {
  if (db) {
    return db
  }

  const databaseDirectory = path.join(app.getPath('userData'), 'data')
  mkdirSync(databaseDirectory, { recursive: true })
  db = openQualidexDatabase(path.join(databaseDirectory, 'qualidex.sqlite'))

  return db
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    title: 'Qualidex',
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

ipcMain.handle('app:get-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
}))

ipcMain.handle('dialog:select-source-directory', async () => {
  const options: OpenDialogOptions = {
    title: '选择资料目录',
    properties: ['openDirectory'],
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('files:scan-directory', async (_event, directoryPath: string) => {
  return importDirectory(getDatabase(), directoryPath)
})

ipcMain.handle('imports:list-batches', async (_event, limit?: number) => {
  return listImportBatches(getDatabase(), limit)
})

ipcMain.handle('imports:rescan-directory', async (_event, directoryPath: string) => {
  return rescanDirectory(getDatabase(), directoryPath)
})

ipcMain.handle('imports:rescan-batch', async (_event, batchId: string) => {
  return rescanImportBatch(getDatabase(), batchId)
})

ipcMain.handle('processing:list-tasks', async (_event, limit?: number, status?: ProcessingTaskStatus) => {
  return listProcessingTasks(getDatabase(), limit, status)
})

ipcMain.handle('processing:run-next-task', async (_event, taskType?: ProcessingTaskType) => {
  return executeNextProcessingTask(getDatabase(), taskType)
})

ipcMain.handle('processing:run-batch', async (_event, maxTasks?: number, taskType?: ProcessingTaskType) => {
  return executeProcessingBatch(getDatabase(), maxTasks, taskType)
})

ipcMain.handle('archive:preview', async (_event, outputRoot: string) => {
  return generateArchivePreview(getDatabase(), outputRoot)
})

ipcMain.handle('archive:write', async (_event, outputRoot: string) => {
  return writeArchiveFromPreview(getDatabase(), outputRoot)
})

ipcMain.handle('review:list-items', async (_event, limit?: number) => {
  return listReviewItems(getDatabase(), limit)
})

ipcMain.handle('review:confirm-item', async (_event, reviewItemId: string, confirmedValue?: string | null) => {
  return confirmReviewItem(getDatabase(), reviewItemId, confirmedValue)
})

ipcMain.handle('review:ignore-item', async (_event, reviewItemId: string, reason?: string | null) => {
  return ignoreReviewItem(getDatabase(), reviewItemId, reason)
})

ipcMain.handle('review:update-fields', async (_event, reviewItemId: string, patch: ReviewFieldPatch) => {
  return updateReviewFields(getDatabase(), reviewItemId, patch)
})

ipcMain.handle('review:list-person-candidates', async (_event, query?: string, limit?: number) => {
  return listPersonCandidates(getDatabase(), query, limit)
})

ipcMain.handle('review:reassign-person', async (_event, reviewItemId: string, personId: string) => {
  return reassignReviewFilePerson(getDatabase(), reviewItemId, personId)
})

ipcMain.handle('review:create-person', async (_event, reviewItemId: string, input: CreatePersonFromReviewInput) => {
  return createPersonFromReviewItem(getDatabase(), reviewItemId, input)
})

ipcMain.handle('people:merge', async (_event, input: MergePeopleInput) => {
  return mergePeople(getDatabase(), input)
})

ipcMain.handle('query:people', async (_event, conditions?: QueryPeopleConditions) => {
  return queryPeople(getDatabase(), conditions)
})

ipcMain.handle('export:query-results-excel', async (
  _event,
  conditions?: QueryPeopleConditions,
  options?: QueryResultsExcelExportOptions,
) => {
  const result = win
    ? await dialog.showSaveDialog(win, {
        title: '导出查询结果',
        defaultPath: `查询结果-${formatDateForFileName(new Date())}.xlsx`,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      })
    : await dialog.showSaveDialog({
        title: '导出查询结果',
        defaultPath: `查询结果-${formatDateForFileName(new Date())}.xlsx`,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      })

  if (result.canceled || !result.filePath) {
    return null
  }

  return exportQueryResultsExcel(getDatabase(), conditions ?? {}, result.filePath, options ?? {})
})

ipcMain.handle('export:query-result-files', async (_event, conditions?: QueryPeopleConditions) => {
  const result = win
    ? await dialog.showOpenDialog(win, {
        title: '选择查询资料导出目录',
        properties: ['openDirectory', 'createDirectory'],
      })
    : await dialog.showOpenDialog({
        title: '选择查询资料导出目录',
        properties: ['openDirectory', 'createDirectory'],
      })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return exportQueryResultFiles(getDatabase(), conditions ?? {}, result.filePaths[0])
})

ipcMain.handle('recycle:list', async (_event, limit?: number) => {
  return listDeletedItems(getDatabase(), limit)
})

ipcMain.handle('recycle:soft-delete-person', async (_event, personId: string, reason?: string) => {
  return softDeletePerson(getDatabase(), personId, reason)
})

ipcMain.handle('recycle:restore-person', async (_event, personId: string) => {
  return restorePerson(getDatabase(), personId)
})

ipcMain.handle('recycle:soft-delete-file', async (_event, fileId: string, reason?: string) => {
  return softDeleteFile(getDatabase(), fileId, reason)
})

ipcMain.handle('recycle:restore-file', async (_event, fileId: string) => {
  return restoreFile(getDatabase(), fileId)
})

ipcMain.handle('archive:cleanup-output', async (_event, outputRoot: string) => {
  return cleanupArchiveOutput(getDatabase(), outputRoot)
})

ipcMain.handle('export:recognition-review-excel', async () => {
  const result = win
    ? await dialog.showSaveDialog(win, {
        title: '导出识别验收表',
        defaultPath: `识别验收-${formatDateForFileName(new Date())}.xlsx`,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      })
    : await dialog.showSaveDialog({
        title: '导出识别验收表',
        defaultPath: `识别验收-${formatDateForFileName(new Date())}.xlsx`,
        filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
      })

  if (result.canceled || !result.filePath) {
    return null
  }

  return exportRecognitionReviewExcel(getDatabase(), result.filePath)
})

function formatDateForFileName(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}${month}${day}-${hour}${minute}`
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(createWindow)
