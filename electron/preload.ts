import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('qualidex', {
  getAppInfo() {
    return ipcRenderer.invoke('app:get-info')
  },
})
