# Qualidex 验收功能点

本文用于阶段验收、换号交接和后续补单测 / E2E 时对齐范围。验收优先使用 `pnpm run verify:p1`，它串联了 P1 主链路验证、lint 和 build，但不包含会触发 native rebuild 的 `verify:db`。

## 总体验收命令

```powershell
pnpm run verify:p1
```

单独验收时可按下面功能块运行对应命令。

## P0 样本闭环

- Electron + React + TypeScript 桌面壳可构建。
- 能选择本地资料目录并递归扫描文件。
- 能计算文件 hash，识别新增和重复文件。
- 能写入 SQLite 基础表。
- 能对少量图片或 PDF 样本进行 OCR / 文本提取。
- 能调用 AI 将 OCR 文本抽取成人员、类别、地区、证书等结构化字段。
- 能生成简单 Excel，用于人工验证识别效果。

验收命令：

```powershell
pnpm run build
pnpm run verify:scan
pnpm run verify:hash
pnpm run verify:text-extract
pnpm run verify:ai-extract
pnpm run verify:excel-export
```

## 导入与重新扫描

- 支持导入批次。
- 支持新增文件夹导入。
- 支持目录重新扫描和批次重新扫描。
- 原始资料目录只读，不移动、不删除、不覆盖原始文件。
- 新文件写入数据库，并为后续 OCR 建立任务。
- 重复文件按 hash 识别，不重复入库。

验收命令：

```powershell
pnpm run verify:import-batches
```

## OCR / AI 任务队列

- 导入后自动创建 OCR 任务。
- OCR 完成后可进入 AI 抽取任务。
- 任务支持 `pending / running / completed / failed / skipped` 状态。
- 任务失败记录错误信息。
- 低置信度或缺字段结果进入待确认。

验收命令：

```powershell
pnpm run verify:processing-worker
pnpm run verify:processing-worker-ai-success
pnpm run verify:structured-recognition
```

## 待确认工作台

- 待确认页读取真实 `review_items`。
- 支持确认和忽略待确认项。
- 支持编辑主类别、地区、资料类型。
- 支持编辑证书名称、证书认可状态。
- 支持把待确认文件切换到已有人员。
- 支持从待确认项新建人员。
- 操作写入 `audit_logs`。
- 相关人员标记 `archive_dirty`。

验收命令：

```powershell
pnpm run verify:review-list
pnpm run verify:review-actions
pnpm run verify:review-field-update
pnpm run verify:review-license-update
pnpm run verify:review-person-reassign
pnpm run verify:review-create-person
```

## 人员合并 / 拆分

- 支持把资料关联从一个人员切换到另一个已有人员。
- 支持从待确认资料拆分出新人员。
- 支持合并两个已有人员。
- 合并时源人员标记为 `merged`，不物理删除记录。
- 合并时资料和证书关联转移到目标人员。
- 合并写入 `audit_logs`，并标记相关人员 `archive_dirty`。

验收命令：

```powershell
pnpm run verify:people-merge
```

## 标准归档

- 能生成归档目标路径预览。
- 预览阶段不复制、不修改文件。
- 写入归档时只复制安全项到输出目录。
- 待确认、路径冲突、目标已存在、路径越界会跳过。
- 不移动、不删除、不覆盖原始资料。

验收命令：

```powershell
pnpm run verify:archive-preview
pnpm run verify:archive-write
```

## 查询与导出

- 查询页使用真实条件和 SQL 查询。
- 支持类别多选、地区、学历、证书、是否包含待确认。
- 默认不包含待确认资料。
- 查询结果基于 `people / licenses / person_documents / files`。
- 支持导出查询结果 Excel。
- 支持导出命中人员资料文件夹。
- 查询导出记录写入 `export_jobs`。
- 资料导出只复制到用户选择的输出目录，不覆盖已有文件。

验收命令：

```powershell
pnpm run verify:query-export-recycle
```

## 回收站与清理

- 支持人员软删除。
- 支持文件软删除。
- 支持人员和文件恢复。
- 软删除不物理删除原始资料。
- 支持清理归档输出副本。
- 清理归档输出不会触碰原始资料目录。

验收命令：

```powershell
pnpm run verify:query-export-recycle
```

## UI 与文案

- 主工作台包含首页、查询、导入、待确认、导出几个 workspace。
- 主流程可见文案为中文。
- 查询页、首页已清理历史乱码文案。
- 面向业务用户的主 UI 避免暴露 SQLite、OCR pipeline、import_batch 等技术词。

验收命令：

```powershell
pnpm run lint
pnpm run build
```

## Native Binding 注意事项

## 开发库清理

如果早期开发版本已经把重复文件或 hash 失败文件写入 `files` 表，可先执行 dry-run：

```powershell
pnpm run cleanup:import-pollution
```

确认输出后再执行真实清理：

```powershell
pnpm run cleanup:import-pollution -- --apply
```

脚本只清理导入阶段污染数据：`process_status = 'duplicate'`，以及 `process_status = 'failed' AND sha256 IS NULL` 的文件记录，并同步删除这些文件关联的处理任务、AI 结果、待确认项、证书和人员资料关联。执行 `--apply` 前会备份 `qualidex.sqlite`、`qualidex.sqlite-wal`、`qualidex.sqlite-shm` 到数据库目录下的 `backups/`。

该脚本使用 Node 内置 `node:sqlite`，需要 Node 22+。它不依赖 `better-sqlite3`，因此不会影响 Electron 运行时使用的 native binding。

暂不建议随手运行：

```powershell
pnpm run verify:db
```

原因：该命令会触发 `electron-rebuild`，在当前机器缺少 Visual Studio C++ 构建环境时可能破坏 `better-sqlite3` 的 Electron native binding。

如果资料扫描时报 `better-sqlite3.node was compiled against a different Node.js version`，可在以下目录执行恢复命令：

```powershell
cd E:\code\Work\qualidex\node_modules\.pnpm\better-sqlite3@12.10.0\node_modules\better-sqlite3
pnpm exec prebuild-install --runtime=electron --target=30.0.1 --dist-url=https://electronjs.org/headers
```
