# Node 脚本与 SQLite 运行时规则

本文补充 `AGENTS.md`，用于避免 Electron runtime、普通 Node runtime 和 SQLite native binding 混用。

## 背景

Qualidex 应用运行在 Electron 中。Electron 自带 Node.js，但它的 native addon ABI 可能不同于同版本的官方 Node.js。

当前已确认的例子：

```text
普通 Node 20.16.0: process.versions.modules = 115
Electron 30.5.1 内置 Node 20.16.0: process.versions.modules = 123
```

`better-sqlite3` 是 native addon，同一个 `better_sqlite3.node` 不能同时适配 `modules=115` 和 `modules=123`。

因此：

- 应用代码可以使用为 Electron runtime 编译的 `better-sqlite3`。
- 普通 Node.js 脚本不要直接 `require('better-sqlite3')` 访问应用数据库。
- 不要为了让脚本能跑而随手 `pnpm rebuild better-sqlite3`，这可能破坏 Electron 应用运行时可用的 native binding。

## 正确分工

### Electron 应用代码

Electron Main Process、preload 暴露的 IPC、业务 service、repository 可以使用：

```ts
import Database from 'better-sqlite3'
```

数据库默认位置：

```text
%APPDATA%\qualidex\data\qualidex.sqlite
```

应用侧 SQLite 是事实源，Renderer 不得直接访问 SQLite。

### 普通 Node.js 开发脚本

普通 Node.js 脚本包括：

- 数据库查看脚本
- 开发期清理脚本
- 一次性修复脚本
- 非 Electron verify 辅助脚本

这些脚本访问 SQLite 时优先使用 Node 内置 `node:sqlite`：

```js
import { DatabaseSync } from 'node:sqlite'

const db = new DatabaseSync(process.env.APPDATA + '\\\\qualidex\\\\data\\\\qualidex.sqlite')
const rows = db.prepare('SELECT name FROM sqlite_master WHERE type = ?').all('table')
db.close()
```

项目脚本中如果使用 `node:sqlite`，需要 Node 22+。如果开发者当前切到 Node 20 仅为了贴近 Electron 内置 Node，请切回 Node 22 运行这类普通 Node 脚本。

如果未来需要支持 Node 20 的普通脚本，可考虑：

- Python 标准库 `sqlite3`
- 系统 `sqlite3.exe`
- WASM / pure JS SQLite 包

不要把普通脚本改回直接依赖 Electron 编译过的 `better-sqlite3`。

## WAL 注意事项

应用数据库启用了 WAL：

```text
qualidex.sqlite
qualidex.sqlite-wal
qualidex.sqlite-shm
```

查看或备份数据库时：

- 优先直接打开原目录的 `qualidex.sqlite`。
- 如果复制出去查看，必须同时复制 `.sqlite`、`.sqlite-wal`、`.sqlite-shm`。
- 应用关闭后 SQLite 可能会 checkpoint，将 WAL 内容合并回主库。

开发清理脚本执行真实写入前，必须备份这三个文件。

## 现有清理脚本

开发期导入污染清理脚本：

```powershell
pnpm run cleanup:import-pollution
pnpm run cleanup:import-pollution -- --apply
```

该脚本使用 `node:sqlite`，不依赖 `better-sqlite3`。

默认只清理早期导入逻辑造成的污染：

- `files.process_status = 'duplicate'`
- `files.process_status = 'failed' AND files.sha256 IS NULL`

不清理 OCR 阶段失败但已经合法导入的文件，例如 `process_status = 'ocr_failed'`。

## 排查命令

查看普通 Node runtime：

```powershell
node -p "process.version + ' modules=' + process.versions.modules"
```

查看 Electron runtime：

```powershell
@'
const { app } = require('electron')
app.whenReady().then(() => {
  console.log(process.versions)
  app.quit()
})
'@ | Set-Content .tmp-electron-versions.cjs -Encoding UTF8

.\node_modules\.bin\electron.CMD .\.tmp-electron-versions.cjs

Remove-Item .\.tmp-electron-versions.cjs
```

重点看：

- `process.versions.node`
- `process.versions.modules`
- `process.versions.electron`

如果 `better-sqlite3` 报 `NODE_MODULE_VERSION` 不匹配，先确认是在普通 Node 脚本中误用了 Electron native binding，还是应用侧 binding 需要重新按 Electron runtime 安装。

## 禁止事项

- 不要在普通 Node 脚本里直接加载 Electron 编译过的 `better-sqlite3`。
- 不要通过临时 Electron 小程序来跑普通数据库清理脚本，除非确实是在验证 Electron 主进程行为。
- 不要随手运行会重编译 native binding 的命令，除非明确知道目标 runtime 是普通 Node 还是 Electron。
