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
})
