import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('qualidex', {
  getAppInfo() {
    return ipcRenderer.invoke('app:get-info')
  },
  selectSourceDirectory() {
    return ipcRenderer.invoke('dialog:select-source-directory')
  },
  scanDirectory(directoryPath: string) {
    return ipcRenderer.invoke('files:scan-directory', directoryPath)
  },
  listImportBatches(limit?: number) {
    return ipcRenderer.invoke('imports:list-batches', limit)
  },
  rescanDirectory(directoryPath: string) {
    return ipcRenderer.invoke('imports:rescan-directory', directoryPath)
  },
  rescanImportBatch(batchId: string) {
    return ipcRenderer.invoke('imports:rescan-batch', batchId)
  },
  listProcessingTasks(limit?: number, status?: string) {
    return ipcRenderer.invoke('processing:list-tasks', limit, status)
  },
  runNextProcessingTask(taskType?: string) {
    return ipcRenderer.invoke('processing:run-next-task', taskType)
  },
  runProcessingBatch(maxTasks?: number, taskType?: string) {
    return ipcRenderer.invoke('processing:run-batch', maxTasks, taskType)
  },
  generateArchivePreview(outputRoot: string) {
    return ipcRenderer.invoke('archive:preview', outputRoot)
  },
  writeArchive(outputRoot: string) {
    return ipcRenderer.invoke('archive:write', outputRoot)
  },
  exportRecognitionReviewExcel() {
    return ipcRenderer.invoke('export:recognition-review-excel')
  },
})
