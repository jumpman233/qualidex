# Qualidex 工作交接记录

更新时间：2026-05-20

这份文档放在 `docs/work-breakdown.md` 旁边，用于换号、恢复上下文或重新进入任务时快速接续。

## 必读规则

- 开发前优先读 `AGENTS.md`。
- 修改待确认、人员合并/拆分、编辑、软删除或回收站前，读 `docs/prd/04-review-crud.md`。
- 修改文件扫描、复制、归档生成或重新归档逻辑前，读 `docs/prd/02-archive-rules.md`。
- 修改数据表、SQL、仓储或服务前，读 `docs/prd/06-data-model.md`。
- 修改 React UI、交互、命令输入或布局前，读 `docs/prd/07-ui-design.md`。
- 默认中文文档和中文 UI 文案；代码命名、类型名、脚本名可使用英文。

## 硬性产品规则

- 原始资料目录只读。
- 不得移动、覆盖或删除原始资料。
- 数据库是事实源。
- 归档目录是基于数据库生成的输出。
- 文件操作默认只影响归档输出目录。
- 破坏性动作默认软删除。
- OCR / AI 低置信度结果必须进入待确认。
- AI 只提供建议和结构化抽取，最终查询和导出必须基于已确认结构化数据和 SQL。
- 查询类别支持多选；归档目录只使用一个 `primary_category`。
- MVP 不自动把同一人员复制到多个类别归档目录。

## 已完成工作

### P0 样本验证闭环

- Electron + React + TypeScript 桌面壳可运行。
- 支持选择本地资料目录并递归扫描文件。
- 支持计算 sha256 hash，识别新增和重复文件。
- SQLite 基础表已建立。
- 支持少量图片 OCR 和 PDF 文本提取。
- 支持通过可切换 provider / model 的 AI 配置进行结构化抽取；当前使用豆包 Lite / Volcengine 配置。
- 支持生成简单 Excel，用于人工验证识别效果。

### P1-0 UI 蓝图

- 已基于 `docs/ui/ui.png` 和 `docs/ui/design-require.md` 实现单页工作台。
- 覆盖 `home / search / import / review / export` 首版页面状态。
- UI 仍有部分历史乱码文案需要后续顺手清理，但近期新增内容应坚持中文。

### P1-F 人员合并 / 拆分工作流

主要文件：

- `electron/services/reviewService.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/components/MainWorkspace.tsx`
- `scripts/verify-people-merge.mjs`

能力：

- 待确认文件可切换到已有人员。
- 待确认文件可拆分到新建人员。
- 两个已有人员可合并，源人员状态标记为 `merged`，不物理删除记录。
- 合并会把源人员的 `person_documents` 和 `licenses` 转移到目标人员。
- 合并、切换、新建都会写入 `audit_logs`，并标记相关人员 `archive_dirty`。

验证：

```powershell
pnpm run verify:people-merge
pnpm run verify:review-person-reassign
pnpm run verify:review-create-person
```

### P1-A 导入批次 / 新增文件夹 / 重新扫描

主要文件：

- `electron/services/importService.ts`
- `electron/services/fileScanner.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/vite-env.d.ts`
- `scripts/verify-import-batches.mjs`

能力：

- `importDirectory`
- `listImportBatches`
- `rescanDirectory`
- `rescanImportBatch`
- `files.relative_path / path_segments / path_parse_result / path_confidence`
- IPC：`imports:list-batches`、`imports:rescan-directory`、`imports:rescan-batch`

验证：

```powershell
pnpm run verify:import-batches
```

### P1-B OCR / AI 任务队列

主要文件：

- `electron/services/processingQueueService.ts`
- `electron/services/processingWorkerService.ts`
- `electron/db/schema.ts`
- `scripts/verify-processing-queue.mjs`
- `scripts/verify-processing-worker.mjs`
- `scripts/verify-processing-worker-ai-success.mjs`

能力：

- `processing_tasks` 表。
- 导入文件后创建 OCR 任务。
- worker 处理 OCR 成功后创建 AI 抽取任务。
- 可按批次执行处理任务，记录 completed / failed / skipped / remaining。
- IPC：`processing:list-tasks`、`processing:run-next-task`、`processing:run-batch`

验证：

```powershell
pnpm run verify:processing-worker
pnpm run verify:processing-worker-ai-success
```

### P1-C 人员归并、证书识别、低置信度待确认

主要文件：

- `electron/services/structuredRecognitionService.ts`
- `electron/services/aiExtractService.ts`
- `scripts/verify-structured-recognition.mjs`

能力：

- AI 抽取结果写入 `ai_extractions`。
- 结构化识别写入 `people / person_documents / licenses / review_items`。
- 人员归并规则：
  - `name + id_card_last4`：确定同一人。
  - `name + primary_category + region`：疑似同一人。
  - 同名但地区或主类别冲突：进入待确认。
- 低置信度、未知字段、冲突、多人员资料进入 `review_items`。

验证：

```powershell
pnpm run verify:structured-recognition
```

### P1-D 标准归档预览与安全复制

主要文件：

- `electron/services/archivePreviewService.ts`
- `electron/services/archiveWriterService.ts`
- `scripts/verify-archive-preview.mjs`
- `scripts/verify-archive-write.mjs`

能力：

- 根据数据库生成归档路径预览。
- 路径规则：
  - `primary_category / region / personFolder / documentFolder / filename`
  - 地区未知：`未划分区域`
  - 多人员资料：`_多人员资料`
  - 待确认：`99_待确认`
  - 证书资料：`03_证书资料`
- 安全复制只写归档输出目录。
- 跳过待确认、路径冲突、目标已存在、越界路径。
- 不移动、不删除、不覆盖原始资料。

验证：

```powershell
pnpm run verify:archive-preview
pnpm run verify:archive-write
```

### P1-E-1 前端导入与处理队列真实接入

主要文件：

- `src/components/MainWorkspace.tsx`
- `src/App.css`

能力：

- 导入页支持选择资料目录。
- 导入页调用真实 `window.qualidex.scanDirectory`。
- 展示扫描、新增、重复、失败统计。
- 展示导入文件状态。
- 支持刷新处理任务。
- 支持调用 `window.qualidex.runProcessingBatch(10)`。
- 展示 OCR / AI 队列处理结果和最近任务状态。

验证：

```powershell
pnpm run verify:import-batches
pnpm run verify:processing-worker
pnpm run lint
pnpm run build
```

### P1-E-2 待确认真实列表只读接入

主要文件：

- `electron/services/reviewService.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/electron-env.d.ts`
- `src/vite-env.d.ts`
- `src/components/MainWorkspace.tsx`
- `src/App.css`
- `scripts/verify-review-list.mjs`
- `package.json`

能力：

- 从 `review_items` 读取真实待确认项。
- 联查文件、人员、资料关联、证书和最新 AI 抽取结果。
- 待确认页支持刷新、加载、错误、空状态。
- 展示待确认类型、原因、文件名、原始路径、人员、类别、地区、资料类型、证书名、OCR 文本预览和 AI 摘要。
- “确认 / 忽略 / 查看文件”按钮目前只做占位，不修改数据库。

验证：

```powershell
pnpm run verify:review-list
pnpm run verify:structured-recognition
pnpm run lint
pnpm run build
```

### P1-E-3 待确认项确认 / 忽略动作

主要文件：

- `electron/services/reviewService.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/electron-env.d.ts`
- `src/vite-env.d.ts`
- `src/components/MainWorkspace.tsx`
- `scripts/verify-review-actions.mjs`
- `package.json`

能力：

- 支持单条待确认项确认。
- 支持单条待确认项忽略。
- 更新 `review_items.status / confirmed_value / updated_at`。
- 写入 `audit_logs`，记录处理前后值。
- 如果待确认项关联文件，则标记该文件关联人员 `archive_dirty = 1`。
- 前端按钮接入真实动作，成功后刷新列表，失败时展示错误。

验证：

```powershell
pnpm run verify:review-actions
pnpm run verify:review-list
pnpm run lint
pnpm run build
```

### P1-E-4 待确认字段编辑

主要文件：

- `electron/services/reviewService.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/electron-env.d.ts`
- `src/vite-env.d.ts`
- `src/components/MainWorkspace.tsx`
- `src/App.css`
- `scripts/verify-review-field-update.mjs`
- `package.json`

能力：

- 支持在待确认卡片编辑主类别、地区、资料类型。
- 主类别写入 `person_documents.target_category`、`people.primary_category`、`licenses.primary_category`。
- 地区写入 `people.region`、`licenses.region`。
- 资料类型写入 `person_documents.document_type`。
- 人工修改字段来源标记为 `manual`，置信度写为 `1`。
- 写入 `audit_logs`，记录字段修改前后快照。
- 标记关联人员 `archive_dirty = 1`。
- 保存字段后刷新待确认列表。

验证：

```powershell
pnpm run verify:review-field-update
pnpm run verify:review-actions
pnpm run verify:review-list
pnpm run lint
pnpm run build
```

### P1-E-5 待确认人员切换

主要文件：

- `electron/services/reviewService.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `electron/electron-env.d.ts`
- `src/vite-env.d.ts`
- `src/components/MainWorkspace.tsx`
- `scripts/verify-review-person-reassign.mjs`
- `package.json`

能力：

- 支持列出已有人员候选。
- 待确认卡片人员字段支持选择已有人员。
- 支持把待确认文件关联到目标人员。
- 同步更新 `person_documents.person_id` 和同文件 `licenses.person_id`。
- 写入 `audit_logs`，记录新旧人员关联快照。
- 标记新旧相关人员 `archive_dirty = 1`。

验证：

```powershell
pnpm run verify:review-person-reassign
pnpm run verify:review-field-update
pnpm run verify:review-actions
pnpm run lint
pnpm run build
```

## 当前拆分：P1-F 已完成

P1-E / P1-F 的当前拆分项已经完成：

1. 前端导入与处理队列真实接入。
2. 待确认真实列表只读接入。
3. 待确认项确认 / 忽略动作。
4. 待确认主类别、地区、资料类型字段编辑。
5. 待确认文件切换到已有人员。
6. 待确认证书名称、证书认可状态字段编辑。
7. 从待确认项新建人员，并把当前文件的资料关联和证书关联绑定到新人员。
8. 两个已有人员可合并，源人员软删除为 `merged`，资料和证书关联转移到目标人员。

新增验证：

```powershell
pnpm run verify:review-license-update
pnpm run verify:review-create-person
pnpm run verify:review-list
pnpm run verify:review-actions
pnpm run verify:review-field-update
pnpm run verify:review-person-reassign
pnpm run verify:people-merge
pnpm run lint
pnpm run build
```

### 后续步骤

1. P1-G 查询页真实条件确认与 SQL 查询已完成。
   - 真实条件输入：类别多选、地区、学历、证书、是否包含待确认。
   - SQL 查询基于 `people / licenses / person_documents / files` 中已确认或允许待确认的数据。
   - 查询结果展示人员、类别、地区、学历、证书和资料数量。
2. P1-H 完整导出已完成。
   - 查询结果 Excel。
   - 查询命中人员的资料文件夹导出，只复制到用户选择的输出目录，不覆盖已有文件。
   - 写入 `export_jobs`。
3. P1-I 回收站 / 软删除恢复 / 归档输出清理已完成。
   - 人员和文件软删除。
   - 软删除恢复。
   - 清理归档输出副本，不触碰原始资料。
4. P1-J 可见中文文案清理已完成。
   - 首页和查询页已清理历史乱码/编码污染文案。
   - 后续仍可继续巡检低频页面与历史注释，但主流程可见文案已恢复中文。
5. P1-K 回归验证入口已完成。
   - 新增 `pnpm run verify:p1`，串联 P1 主链路验证、lint 和 build。
   - 不包含会触发 native rebuild 的 `verify:db`。
6. 后续建议：补真正的单测与 Electron E2E。

新增验证：

```powershell
pnpm run verify:query-export-recycle
pnpm run verify:p1
pnpm run lint
pnpm run build
```

## 当前验证注意事项

已知不要随手运行：

```powershell
pnpm run verify:db
```

原因：当前脚本会触发 `electron-rebuild`，在缺少 Visual Studio C++ 构建环境时可能破坏 `better-sqlite3` 的 Electron native binding。

如果报错：

```text
better_sqlite3.node was compiled against a different Node.js version
```

恢复方式：

```powershell
cd E:\code\Work\qualidex\node_modules\.pnpm\better-sqlite3@12.10.0\node_modules\better-sqlite3
pnpm exec prebuild-install --runtime=electron --target=30.0.1 --dist-url=https://electronjs.org/headers
```

## 推荐换号后的第一句

可以直接说：

```text
继续 Qualidex，先读 AGENTS.md 和 docs/work-breakdown-handoff.md。P1-G / P1-H / P1-I 已完成，请从历史乱码 UI 文案清理、单测与 E2E 或下一阶段功能开始拆分。
```
