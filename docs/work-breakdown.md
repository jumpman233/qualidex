# 工作拆分

## 当前完成状态（2026-05-20）

> 本段用于换号或恢复上下文时快速接续。详细交接见 [work-breakdown-handoff.md](./work-breakdown-handoff.md)。

### 已完成

- P0 样本验证闭环已完成：Electron + React + TypeScript 桌面壳、目录选择与递归扫描、hash 去重、SQLite 基础表、OCR / PDF 文本提取、AI 结构化抽取、简单 Excel 人工验收导出。
- P1-0 页面 UI 蓝图已完成：按照 `docs/ui/ui.png` 和 `docs/ui/design-require.md` 实现了单页工作台的 `home / search / import / review / export` 首版页面状态。
- P1-A 导入批次能力已完成：支持导入批次、新增目录导入、目录重新扫描、批次重新扫描，并保留原始资料只读规则。
- P1-B OCR / AI 任务队列已完成：建立 `processing_tasks`，导入后创建 OCR 任务，worker 可串行处理 OCR 与 AI 抽取任务，并记录状态、失败与跳过。
- P1-C 人员归并与结构化识别已完成：支持按姓名、身份证后四位、地区、主类别进行确定性归并；冲突、低置信度、未知字段进入 `review_items`。
- P1-D 标准归档预览与安全复制已完成：支持归档目标路径预览、待确认/冲突项跳过、安全复制到输出目录；不会移动、删除或覆盖原始资料。
- P1-E-1 前端导入与处理队列接入已完成：导入页已接真实 IPC，支持选择目录、导入资料、刷新任务、处理 10 个队列任务、展示导入与队列状态。
- P1-E-2 待确认真实列表只读接入已完成：待确认页已接 `review_items` 真实数据，支持刷新、空状态、错误状态、OCR / AI 摘要与人员/类别/地区/资料类型建议展示；确认、忽略、编辑仍为占位。
- P1-E-3 待确认项确认 / 忽略动作已完成：支持单条确认或忽略，更新 `review_items`，写入 `audit_logs`，并标记关联人员 `archive_dirty`。
- P1-E-4 待确认字段编辑已完成：支持修改主类别、地区、资料类型，写入 `people / person_documents / licenses`，记录 `audit_logs`，并标记关联人员 `archive_dirty`。
- P1-E-5 待确认人员切换已完成：支持列出已有人员候选，并把待确认文件关联到已有人员；同步更新资料关联和证书人员，写入 `audit_logs`，标记新旧人员 `archive_dirty`。
- P1-E-6 待确认证书字段编辑已完成：支持修改证书名称、证书认可状态，写入 `licenses`，记录 `audit_logs`，并标记关联人员 `archive_dirty`。
- P1-E-7 待确认新建人员已完成：支持从待确认项新建人员，并把当前文件的资料关联和证书关联绑定到新人员；保留原始资料只读规则。
- P1-F 人员合并 / 拆分工作流已完成：支持把待确认文件切换到已有人员、拆分为新建人员、合并两个已有人员；合并会转移资料和证书关联，源人员软删除为 `merged`，并写入 `audit_logs`。
- P1-G 查询页真实条件确认与 SQL 查询已完成：支持类别多选、地区、学历、证书、是否包含待确认，查询基于 `people / licenses / person_documents / files` 的 SQL 结果。
- P1-H 完整导出已完成：支持查询结果 Excel、查询命中人员资料文件夹导出，并记录 `export_jobs`；资料导出只复制到用户选择的输出目录且不覆盖已有文件。
- P1-I 回收站 / 软删除恢复 / 归档输出清理已完成：支持人员和文件软删除、恢复，以及清理归档输出副本；原始资料不移动、不删除。
- P1-J 可见中文文案清理已完成：修复首页和查询页的历史乱码/编码污染文案，保证当前主流程展示为中文。
- P1-K 回归验证入口已完成：新增 `pnpm run verify:p1` 串联 P1 主链路验证、lint 和 build；不包含会触发 native rebuild 的 `verify:db`。

### 进行中

- 暂无。

### 暂缓 / 未开始

- 证书候选确认的更高级交互。
- 单测与 E2E；当前已为未来验证脚本和主链路留出空间。

### 当前验证情况

- 已通过：`pnpm run verify:import-batches`
- 已通过：`pnpm run verify:processing-worker`
- 已通过：`pnpm run verify:archive-preview`
- 已通过：`pnpm run verify:archive-write`
- 已通过：`pnpm run verify:structured-recognition`
- 已通过：`pnpm run verify:processing-worker-ai-success`
- 已通过：`pnpm run verify:review-list`
- 已通过：`pnpm run verify:review-actions`
- 已通过：`pnpm run verify:review-field-update`
- 已通过：`pnpm run verify:review-license-update`
- 已通过：`pnpm run verify:review-person-reassign`
- 已通过：`pnpm run verify:review-create-person`
- 已通过：`pnpm run verify:people-merge`
- 已通过：`pnpm run verify:query-export-recycle`
- 已通过：`pnpm run verify:p1`
- 已通过：`pnpm run lint`
- 已通过：`pnpm run build`
- 暂不建议运行：`pnpm run verify:db`。该脚本会触发 `electron-rebuild`，在当前机器缺少 Visual Studio C++ 构建环境时可能破坏 `better-sqlite3` 的 Electron native binding。

### Native binding 注意事项

如果资料扫描时报 `better-sqlite3.node was compiled against a different Node.js version`，在以下目录执行恢复命令：

```powershell
cd E:\code\Work\qualidex\node_modules\.pnpm\better-sqlite3@12.10.0\node_modules\better-sqlite3
pnpm exec prebuild-install --runtime=electron --target=30.0.1 --dist-url=https://electronjs.org/headers
```

来源：[prd.md](./prd.md)

本文只做开发工作拆分，不开始执行实现。

## 需求变更后的后续工作拆分（2026-05-21）

> 基于 `docs/prd` V1.5 变更。整体顺序 OK：先补齐完整身份证号与隐私边界，再处理归档命名、多证书、文件夹级二次归并和多人员资料；证书来源可信度与类别动态配置作为 P1 后续增强。

### P0-1 完整身份证号

目标：保证人员归并、冲突判断、查询、导出有稳定唯一识别依据。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.4.1、`docs/prd/04-review-crud.md` 10.1 / 15.1、`docs/prd/05-ai-ocr-rules.md` 22、`docs/prd/06-data-model.md` 19.1。
- UI 文档：`docs/prd/07-ui-design.md` 18.4 / 18.5 / 18.6 / 18.8；`docs/ui/design-require.md` 的 search / review / export 交互要求。

工作内容：
- 数据库补齐 `people.id_card_number`，并预留 `id_card_number_encrypted`、`id_card_hash`、`masked_display`。
- 本地 OCR / 本地解析器提取完整身份证号，生成 hash、后四位和脱敏展示值。
- 云端 AI 输入前做脱敏，禁止上传完整身份证号。
- 人员归并、冲突判断、人工合并、查询和导出逻辑改为优先使用完整身份证号或 hash。

验证步骤：
- 导入包含身份证号的样本后，本地 SQLite 能保存完整值，页面默认只显示脱敏值。
- AI 请求日志或测试替身中不出现完整身份证号。
- 同身份证号多文件归并到同一人；姓名相同但身份证号不同进入待确认。

### P0-2 归档文件夹命名

目标：归档目录不暴露完整身份证号。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.4.1、`docs/prd/02-archive-rules.md` 6.5 / 6.7、`docs/prd/03-query-export.md` 15.1 / 15.2、`docs/prd/06-data-model.md` 19.1 / 19.9。
- UI 文档：`docs/prd/07-ui-design.md` 18.2 / 18.3 / 18.5 / 18.8；`docs/ui/design-require.md` 的 import / export 交互要求。

工作内容：
- 统一归档命名为 `姓名_后四位` 或 `姓名_系统编号`。
- 归档预览、归档写入、资料导出都复用同一套安全命名规则。
- Excel 导出保留 `export_full_id_card` 开关，默认导出脱敏值。

验证步骤：
- 归档预览和实际输出路径中不包含完整身份证号。
- 启用和关闭 `export_full_id_card` 时，Excel 身份证字段符合预期。

### P0-3 一人多证书

目标：支持一个人员关联多条证书，查询和导出均准确。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.4.2、`docs/prd/03-query-export.md` 13 / 14.4 / 15.1 / 15.5、`docs/prd/04-review-crud.md` 11.2 / 15.1、`docs/prd/06-data-model.md` 19.6。
- UI 文档：`docs/prd/07-ui-design.md` 18.4 / 18.5 / 18.6 / 18.8；`docs/ui/design-require.md` 的 search / review / export 交互要求。

工作内容：
- 检查并补齐 `licenses` 与 `people` 的一对多关系。
- OCR / AI 抽取结果落库时允许同一人员写入多条证书。
- 待确认、人员详情、查询结果、Excel 导出、文件夹导出提示中展示多证书信息。
- 冲突提示和批量操作要同时考虑所有证书。

验证步骤：
- 同一人两张证书样本能落为两条证书记录。
- 按任一证书查询都能命中该人员。
- 导出结果能看到该人员的多证书信息。

### P0-4 文件夹级二次归并

目标：同一文件夹内资料可以被统一判断归属，降低散乱文件误归档。

阅读入口：
- 需求文档：`docs/prd/01-user-flows.md` 9、`docs/prd/02-archive-rules.md` 6.8 / 6.9、`docs/prd/04-review-crud.md` 10.4 / 11.1、`docs/prd/06-data-model.md` 19.3 / 19.8。
- UI 文档：`docs/prd/07-ui-design.md` 18.3 / 18.4 / 18.5；`docs/ui/design-require.md` 的 import / review 交互要求。

工作内容：
- 按导入批次、父文件夹、相对路径对文件分组。
- 对同一文件夹内的姓名、完整身份证号、类别、地区、证书线索做二次归并。
- 冲突或多人员文件生成待确认项。
- 数据库记录文件夹级归并结果和关联证据。

验证步骤：
- 同一文件夹内多个文件指向同一完整身份证号时，能归并为同一人。
- 同一文件夹出现多个身份证号或多个人名时，生成待确认项。

### P0-5 多人员文件识别

目标：一个 PDF / 图片中出现多个人员时正确标记和关联。

阅读入口：
- 需求文档：`docs/prd/02-archive-rules.md` 6.7、`docs/prd/03-query-export.md` 15.2 / 15.3、`docs/prd/04-review-crud.md` 11.1 / 11.2、`docs/prd/06-data-model.md` 19.3 / 19.5 / 19.8。
- UI 文档：`docs/prd/07-ui-design.md` 18.3 / 18.4 / 18.5 / 18.6 / 18.8；`docs/ui/design-require.md` 的 review / export 交互要求。

工作内容：
- 识别多人员文件，设置多人员标记。
- 建立文件与多个人员的关联记录。
- 归档时只复制到 `_多人员资料`，不自动复制到每个人目录。
- 人员详情、待确认和导出中提示该文件涉及多个人。

验证步骤：
- 多人员样本能创建多个关联人员。
- 归档输出中该文件只出现在 `_多人员资料`。
- 查询和导出能提示多人员资料关联。

### P0-6 人工校验可查看文件

目标：待确认时能看到原始文件、路径和抽取证据，并能修改关键字段。

阅读入口：
- 需求文档：`docs/prd/02-archive-rules.md` 6.9、`docs/prd/04-review-crud.md` 11.1 / 11.2 / 15.1 / 15.2、`docs/prd/05-ai-ocr-rules.md` 10 / 22、`docs/prd/06-data-model.md` 19.8 / 19.11。
- UI 文档：`docs/prd/07-ui-design.md` 18.4 / 18.5；`docs/ui/design-require.md` 的 review 交互要求。

工作内容：
- 待确认页和人员详情页支持打开原始文件、打开原始文件夹。
- 展示源文件路径、相对路径、OCR 文本摘要、AI 抽取结果和置信度。
- 支持修改主类别、地区、人员、资料类型、证书信息。
- 所有人工修改写入 `audit_logs`，且不移动、不删除原始资料。

验证步骤：
- 待确认项能打开原始文件或所在文件夹。
- 修改字段后数据库更新，审计日志存在。
- 原始资料路径和文件内容保持不变。

### P0-7 导入完成 CTA

目标：导入处理完成后给用户明确下一步。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.8、`docs/prd/01-user-flows.md` 7.1 / 7.2 / 7.3 / 10、`docs/prd/08-mvp-roadmap.md` 22.1 / 22.3。
- UI 文档：`docs/prd/07-ui-design.md` 18.2 / 18.3；`docs/ui/design-require.md` 的 import 交互要求。

工作内容：
- 汇总导入批次处理结果和待确认数量。
- 有待确认时引导进入“待确认资料”。
- 无待确认时引导进入“归档预览”。
- 页面提示后续可查询或导出。

验证步骤：
- 构造有待确认和无待确认两类批次，CTA 分别指向正确页面。
- CTA 不依赖 mock 数据，来自真实批次状态。

### P0-8 路径语义解析

目标：利用文件名、文件夹名和相对路径辅助人员归属、类别、地区判断。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.7、`docs/prd/01-user-flows.md` 8.2 / 9、`docs/prd/05-ai-ocr-rules.md` 9、`docs/prd/06-data-model.md` 19.3 路径字段说明、`docs/prd/08-mvp-roadmap.md` 22.6 / 24.1。
- UI 文档：`docs/prd/07-ui-design.md` 18.4 / 18.5 / 18.6；`docs/ui/design-require.md` 的 review / search 交互要求。

工作内容：
- 解析文件名、父文件夹、相对路径中的姓名、地区、类别、资料类型线索。
- 将路径解析结果写入数据库，作为 OCR / AI / 待确认的证据之一。
- 路径线索和 OCR / AI 结果冲突时进入待确认。

验证步骤：
- 样本路径中的地区、类别、姓名线索能被记录。
- 路径线索冲突时不会自动覆盖结构化结果，而是进入待确认。

### P1-1 证书来源可信度

目标：记录颁发机构权威性和可信度，支持人工确认优先。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.6 / 5.6.1、`docs/prd/03-query-export.md` 13.4 / 14.5 / 15.4 / 15.5、`docs/prd/06-data-model.md` 19.6 颁发机构权威性字段说明 / 19.7、`docs/prd/08-mvp-roadmap.md` 22.7 / 24.3。
- UI 文档：`docs/prd/07-ui-design.md` 18.4 / 18.5 / 18.6 / 18.8；`docs/ui/design-require.md` 的 review / search / export 交互要求。

工作内容：
- 补齐 `issuer_authority_level`、`issuer_authority_score`、`issuer_authority_source`、`issuer_authority_review_status`。
- AI / 规则仅提供建议，人工标记优先。
- 不确定结果进入待确认。
- 查询、导出和统计中预留可信度字段。

验证步骤：
- 人工修改可信度后优先级高于 AI / 规则建议。
- 不确定颁发机构进入待确认。

### P1-2 类别动态提供

目标：从内置默认类别过渡到可配置类别列表。

阅读入口：
- 需求文档：`docs/prd/00-overview.md` 5.5、`docs/prd/01-user-flows.md` 12、`docs/prd/02-archive-rules.md` 6.2 / 6.3、`docs/prd/03-query-export.md` 14.2 / 14.3 / 15.6、`docs/prd/06-data-model.md` 19.8.1、`docs/prd/08-mvp-roadmap.md` 22.8。
- UI 文档：`docs/prd/07-ui-design.md` 18.2 / 18.6 / 18.7 / 18.8；`docs/ui/design-require.md` 的 search / import / export 交互要求。

工作内容：
- MVP 默认类别保留：工程、环境、消防员、未识别类别。
- 增加类别配置存储和维护入口。
- 查询和导出复用动态类别列表，并继续支持多选类别。

验证步骤：
- 默认类别无需配置即可使用。
- 新增类别后，导入校验、查询筛选和导出范围能看到该类别。

### 总体验证口径

- 所有文件操作仍只影响归档或导出目录，原始资料不移动、不删除、不覆盖。
- 查询和导出必须基于已确认结构化数据和 SQL。
- 低置信度、身份证冲突、多人员文件、路径冲突必须进入待确认。
- 新增字段涉及数据模型时，同步更新迁移、Repository、IPC 类型、验证脚本和相关 PRD。

## 总体分期

### P0 样本验证版 done

目标：用最小闭环验证“扫描文件 -> OCR/文本提取 -> AI 抽取 -> SQLite 入库 -> 简单导出”的链路是否可行。

交付结果：

- Electron + React + TypeScript 桌面壳可运行。
- 能选择本地资料目录并递归扫描文件。
- 能计算文件 hash，识别新增和重复文件。
- 能写入 SQLite 基础表。
- 能对少量图片或 PDF 样本进行 OCR/文本提取。
- 能调用 AI 将 OCR 文本抽取成人员、类别、地区、证书等结构化字段。
- 能生成简单 Excel，用于人工验证识别效果。

### P1-0 页面 UI 蓝图 done

目标：在进入 P1 业务能力实现前，先把桌面工作台的页面结构、主要交互状态和视觉风格画出来，作为后续 React 组件拆分和真实接口接入的基准。

设计输入：

- UI 参考图：[docs/ui/ui.png](./ui/ui.png)
- 页面设计要求：[docs/ui/design-require.md](./ui/design-require.md)

交付结果：

- 用 mock data 实现单页工作台静态交互。
- 包含顶部栏、智能操作区、状态概览、左侧工作区导航和主工作区。
- 覆盖 `home / search / import / review / export` 几个 workspaceMode 的第一版页面状态。
- 查询模式先展示“系统理解的查询条件”，确认后再展示查询结果。
- 新增资料模式展示默认类别/地区、选择文件夹、整理进度和完成摘要。
- 待确认模式使用卡片式确认，先不做复杂表格。
- 导出模式展示导出预览、导出内容选择、导出位置和风险提示。
- 组件结构预留后续接入 Electron service / IPC，不在 UI 蓝图阶段接真实接口。

验收点：

- 页面视觉与 `docs/ui/ui.png` 的工作台方向一致。
- 页面文案为中文，面向非技术用户。
- 用户能通过 mock 交互理解“查询、导入、待确认、导出”的主流程。
- 组件拆分清晰，后续可以逐步替换 mock data 为真实数据。
- 不引入复杂状态管理库，第一版使用 React `useState`。

### P1 Electron MVP

目标：形成可用于真实整理工作的本地桌面工具。

交付结果：

- 支持导入批次、新增文件夹导入、重新扫描。
- 建立 OCR / AI 任务队列和处理状态。
- 支持人员归并、证书识别、低置信度待确认。
- 支持标准归档目录生成，并确保原始资料不移动、不删除。
- 支持查询、证书候选确认、Excel 导出、文件夹导出。
- 支持人员、文件、资料类型、归档信息的修改。
- 支持软删除、回收站、重新归档。

### P2 完整产品版

目标：提升稳定性、可维护性和复杂资料处理能力。

交付结果：

- 支持断点续跑、失败重试和更完整的任务日志。
- 支持更完整的 PDF 处理和多人员 PDF 按页拆分。
- 建立更完善的证书别名库与匹配策略。
- 支持安装包、OCR 模型分发、自动更新。
- 完成性能优化和长期维护能力建设。

## 工作块拆分

### 1. 项目基础与桌面应用框架

目标：搭好应用骨架、进程边界和基础工程规范。

范围：

- 初始化 electron-vite + React + TypeScript。
- 建立 Electron Main / Preload / Renderer 的基础通信。
- 设计本地配置位置、数据库位置、日志位置。
- 搭建基础页面路由与应用布局。
- 建立通用 IPC 调用约定和错误返回格式。

依赖：无。

建议阶段：P0。

验收点：

- 应用可本地启动。
- Renderer 能通过 IPC 调用 Main Process 能力。
- 有基础错误提示和日志输出。

### 2. 数据库与数据模型

目标：以 SQLite 作为事实源，支撑后续扫描、抽取、归档、查询、删除和审计。

范围：

- 建立 SQLite 初始化与迁移机制。
- 创建 PRD 中定义的核心表：people、files、import_batches、person_documents、licenses、review_items、export_jobs、license_match_logs、audit_logs。
- 封装基础 Repository / DAO。
- 约定软删除字段、状态枚举、时间字段和 ID 生成规则。
- 为 sha256、person_id、file_id、status 等高频查询字段加索引。

依赖：项目基础。

建议阶段：P0 起步，P1 补完整。

验收点：

- 能创建和升级数据库。
- 扫描文件、导入批次、人员、证书、待确认项能稳定入库。
- 原始资料状态、归档状态、删除状态可追踪。

### 3. 文件扫描与导入批次

目标：把本地资料目录转换成可处理、可追踪、可去重的文件记录。

范围：

- 目录选择能力。
- 首次全量导入。
- 新增文件夹导入。
- 指定目录或历史批次重新扫描。
- 支持 jpg、jpeg、png、webp、pdf、doc、docx、xls、xlsx、txt。
- 计算 sha256，识别重复文件。
- 写入 import_batches 和 files。
- 识别压缩包并提示，MVP 不深度解压。

依赖：项目基础、数据库。

建议阶段：P0/P1。

验收点：

- 能递归扫描目录。
- 能识别新增文件和重复文件。
- 能记录导入批次统计：总数、新增、重复、失败。
- 不移动、不删除原始资料。

### 4. OCR 与文本提取

目标：为图片、PDF、Office、文本文件生成后续 AI 抽取可用的文本。

范围：

- 抽象 OCR / 文本提取接口，MVP 不强绑定具体 OCR 引擎。
- 图片进入本地 OCR。
- PDF 优先文本提取，必要时整份 OCR；复杂按页拆分放到 P2。
- Office 文档优先文本提取，失败则进入待确认。
- txt 直接读取文本。
- 记录 ocr_status、process_error、ocr_text。

依赖：文件扫描、数据库。

建议阶段：P0 起步，P1 完善。

验收点：

- 样本图片能生成 OCR 文本。
- PDF / Office / txt 能按策略提取文本或进入失败状态。
- OCR 失败不会中断整个批次。

### 5. AI 结构化抽取与 Prompt

目标：从 OCR 文本中抽取人员、类别、地区、学历、证书、资料类型等结构化信息。

范围：

- 实现 OCR 后结构化抽取 Prompt。
- 实现查询解析 Prompt。
- 实现证书候选分组 Prompt。
- AI 只接收 OCR 后文本，不上传原图。
- 对 OCR 文本进行必要脱敏。
- 保存抽取结果、置信度、证据片段和失败原因。
- 低置信度结果生成 review_items。

依赖：OCR / 文本提取、数据库。

建议阶段：P0/P1。

验收点：

- 能从样本文本抽取人员、地区、类别、证书信息。
- 低置信度、缺字段、冲突信息能进入待确认。
- AI 结果不直接作为最终裁决，必须落到结构化库和人工确认流程。

### 6. 人员归并与资料关联

目标：把分散文件归并到正确人员，并维护人员与资料的关系。

范围：

- 按身份证后四位、姓名、地区、类别、证书等规则归并人员。
- 处理同名冲突。
- 支持人员合并与拆分。
- 建立 person_documents 关联。
- 多人员资料标记 is_multi_person_file，并进入待确认或导出提示。

依赖：AI 抽取、数据库。

建议阶段：P1。

验收点：

- 同一人员的多份资料能关联到同一 people 记录。
- 同名但身份不明确时不能错误合并。
- 多人员资料不会被静默归档到单人目录。

### 7. 待确认工作台

目标：让人工处理低置信度和冲突项，保证归档与查询结果可信。

范围：

- 待确认类型：未识别人员、同名冲突、地区不确定、类别不确定、资料类型不确定、学历不确定、证书不确定、OCR 失败、多人员资料等。
- 待确认列表、筛选、详情。
- 确认、修改、忽略、批量确认。
- 保存 confirmed_value 和审计日志。

依赖：AI 抽取、人员归并、数据库。

建议阶段：P1。

验收点：

- 低置信度项能集中展示。
- 用户确认后对应人员、文件、证书或资料关联被更新。
- 批量确认不会绕过必要的状态记录。

### 8. 归档计划与复制式归档

目标：根据数据库事实源生成标准归档目录，且不破坏原始资料。

范围：

- 归档结构：类别 / 地区 / 人员姓名_唯一标识 / 资料类型。
- 未识别地区进入“未划分区域”。
- 未识别人员进入待确认。
- 多人员资料进入“_多人员资料”或提示。
- 生成归档计划和变更预览。
- 执行复制式归档。
- 支持 archive_dirty 标记和重新归档。

依赖：人员归并、待确认、数据库。

建议阶段：P1。

验收点：

- 能按 PRD 规则复制归档。
- 原始资料不被移动、覆盖或删除。
- 修改人员或资料信息后能预览变更并重新生成归档。

### 9. 证书匹配与查询能力

目标：支持按地区、类别、学历、证书等条件查找人员，并处理证书名称不统一问题。

范围：

- 入库阶段保存原始证书名、标准证书名、证书类别、发证机构、有效期、置信度。
- 查询阶段支持自然语言输入。
- AI 将自然语言解析为结构化查询条件。
- 用户确认 AI 解析结果。
- 证书候选召回、分组展示、用户确认。
- 最终查询基于 SQL 和人工确认条件执行。

依赖：数据库、AI Prompt、证书数据、人员数据。

建议阶段：P1，复杂别名库放 P2。

验收点：

- 能自然语言查询。
- 能展示解析条件并让用户确认。
- 能 SQL 查询人员。
- 证书候选不确定时能让用户确认。

### 10. 导出能力

目标：把查询结果和人员资料输出给业务使用。

范围：

- Excel 导出。
- 人员资料文件夹导出。
- 多人员资料导出提醒。
- 记录 export_jobs。
- 导出结果包含人员、地区、类别、学历、证书、资料完整性等字段。

依赖：查询能力、归档数据、数据库。

建议阶段：P0 做简单 Excel，P1 做完整导出。

验收点：

- P0 能导出用于样本验证的 Excel。
- P1 能导出查询结果和对应人员资料文件夹。
- 多人员资料不会被误导出为单人资料。

### 11. 修改、删除、回收站与审计

目标：支持业务人员修正资料，同时保留可追踪性和恢复能力。

范围：

- 修改人员类别、地区、学历、资料类型、证书信息。
- 修改后标记 archive_dirty。
- 删除归档结果。
- 从系统中软删除文件。
- 软删除人员。
- 回收站恢复。
- audit_logs 记录关键变更。

依赖：数据库、归档计划、人员详情页。

建议阶段：P1。

验收点：

- 修改后能预览归档变更。
- 删除均为软删除。
- 回收站能恢复人员或文件。
- 操作日志能追踪关键修改。

### 12. 前端页面 UI 蓝图

目标：先用 mock data 画出单页工作台，确定 P1 的页面结构、视觉风格和主要交互状态。

范围：

- 参考 `docs/ui/ui.png` 实现桌面工作台首屏视觉。
- 按 `docs/ui/design-require.md` 拆分 AppShell、CommandBar、OverviewCards、MainWorkspace 等组件。
- 使用 mock data 实现 `home / search / import / review / export` 的静态交互。
- 查询页先展示系统理解的查询条件，再展示查询结果。
- 新增资料页展示资料类别、地区、选择文件夹、整理进度、完成摘要。
- 待确认页使用卡片式确认。
- 导出页展示导出预览和风险提示。
- 暂不接真实 Electron API，后续通过 service 层替换 mock 数据。

依赖：P0 样本验证版、UI 参考图、页面设计要求。

建议阶段：P1-0。

验收点：

- 页面能表达主要业务流程和状态变化。
- 视觉风格接近 Notion / 飞书工作台 + ChatGPT 输入框。
- UI 文案使用中文，避免暴露技术词。
- 组件结构能支撑后续真实数据接入。

### 13. 前端真实工作流接入

目标：把 P1 核心能力接入 UI，形成可理解、可连续操作的桌面工具。

范围：

- 数据源与导入真实接入。
- 扫描处理状态接入。
- 待确认真实列表和确认操作接入。
- 人员详情页。
- 查询页真实条件确认与 SQL 查询接入。
- 导出页真实 Excel / 文件夹导出接入。
- 回收站页。
- 任务状态、失败提示、空状态、确认弹窗。

依赖：各核心服务能力、前端页面 UI 蓝图。

建议阶段：P1。

验收点：

- 用户能完成首次导入、处理待确认、生成归档、查询导出的完整流程。
- 页面能清楚展示任务状态和失败原因。
- 高风险操作有确认和可恢复路径。

### 14. 稳定性、性能与发布

目标：把 MVP 打磨成长期可用的本地产品。

范围：

- 断点续跑。
- 失败重试。
- 大批量文件扫描性能优化。
- 更完整 PDF 处理。
- 多人员 PDF 按页拆分。
- 更完善日志系统。
- 安装包。
- OCR 模型分发。
- 自动更新。

依赖：P1 完整链路。

建议阶段：P2。

验收点：

- 大批量文件处理时界面不卡死。
- 中断后能继续。
- 失败任务可重试。
- 用户可通过安装包部署。

## 推荐实施顺序

1. 项目基础与桌面应用框架。
2. 数据库与数据模型。
3. 文件扫描与导入批次。
4. OCR 与文本提取。
5. AI 结构化抽取与 Prompt。
6. P0 简单 Excel 导出。
7. P1-0 页面 UI 蓝图。
8. 人员归并与资料关联。
9. 待确认工作台。
10. 归档计划与复制式归档。
11. 查询、证书匹配与完整导出。
12. 修改、删除、回收站与审计。
13. 前端真实工作流接入。
14. 稳定性、性能与发布。

## 首个迭代建议

首个迭代建议只做 P0 样本验证版，避免过早陷入完整 UI 和复杂 PDF 处理。

建议目标：

- 选择目录。
- 扫描文件。
- hash 去重。
- SQLite 入库。
- 对少量样本执行 OCR / 文本提取。
- 调 AI 抽取结构化字段。
- 导出 Excel。

完成后用真实样本评估：

- OCR 准确率是否可接受。
- AI 对人员、地区、类别、证书的抽取是否稳定。
- 数据库表结构是否需要调整。
- 哪些情况必须进入待确认。
