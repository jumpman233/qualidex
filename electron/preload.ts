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
  listReviewItems(limit?: number) {
    return ipcRenderer.invoke('review:list-items', limit)
  },
  confirmReviewItem(reviewItemId: string, confirmedValue?: string | null) {
    return ipcRenderer.invoke('review:confirm-item', reviewItemId, confirmedValue)
  },
  ignoreReviewItem(reviewItemId: string, reason?: string | null) {
    return ipcRenderer.invoke('review:ignore-item', reviewItemId, reason)
  },
  updateReviewFields(reviewItemId: string, patch: unknown) {
    return ipcRenderer.invoke('review:update-fields', reviewItemId, patch)
  },
  listPersonCandidates(query?: string, limit?: number) {
    return ipcRenderer.invoke('review:list-person-candidates', query, limit)
  },
  reassignReviewPerson(reviewItemId: string, personId: string) {
    return ipcRenderer.invoke('review:reassign-person', reviewItemId, personId)
  },
  createPersonFromReview(reviewItemId: string, input: unknown) {
    return ipcRenderer.invoke('review:create-person', reviewItemId, input)
  },
  mergePeople(input: unknown) {
    return ipcRenderer.invoke('people:merge', input)
  },
  exportRecognitionReviewExcel() {
    return ipcRenderer.invoke('export:recognition-review-excel')
  },
})
