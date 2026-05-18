"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("qualidex", {
  getAppInfo() {
    return electron.ipcRenderer.invoke("app:get-info");
  }
});
