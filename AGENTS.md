# AGENTS.md

## 项目

Qualidex 是一个 Windows 本地桌面应用，用于人员资料归档与资质查询。

产品面向非技术业务用户，帮助用户扫描本地人员资料文件、抽取结构化信息、生成复制式归档目录、复核不确定结果、按资质条件查询人员，并导出匹配人员资料。

## 技术栈

- Electron
- electron-vite
- React
- TypeScript
- SQLite
- sqlite-vec
- 本地 OCR
- 云端文本 AI API

## 文档语言规则

- 项目说明文档、PRD 拆分文档、开发规则、任务拆解默认使用中文。
- 面向用户的 UI 文案默认使用中文。
- 代码命名、类型名、文件名、目录名、脚本名可以使用英文。
- 必要的技术术语可以保留英文，例如 Electron、Renderer、IPC、SQLite、OCR、AI、E2E。

## 硬性产品规则

以下规则不得违反。

1. 不得移动、覆盖或删除原始资料文件。
2. 原始资料目录视为只读。
3. 数据库是事实源。
4. 归档目录是根据数据库生成的输出结果。
5. 除非明确说明，文件操作只能影响归档输出目录。
6. 破坏性操作默认必须是软删除。
7. 低置信度 OCR / AI 结果必须进入待确认。
8. AI 只提供建议和结构化抽取，不做最终裁决。
9. 最终查询和导出结果必须基于已确认结构化数据和 SQL。
10. 查询类别支持多选。
11. 归档类别使用一个 `primary_category`。
12. 查询 `工程 + 消防员` 默认表示类别命中任意一个。
13. MVP 阶段不要自动把同一个人复制到多个类别归档目录。

## 重要业务概念

- `primary_category`：用于生成归档目录的单一主类别。
- `categories`：查询解析和筛选使用的多选类别。
- `person_categories`：为未来真正的人员多类别能力预留。
- `未划分区域`：地区未知时的兜底文件夹。
- `_多人员资料`：包含多个人员资料的文件归档位置。
- `archive_dirty`：数据已变化，需要重新生成归档输出。
- 软删除：从查询、导出和归档中隐藏，但保留记录并可恢复。

## 相关文档

编码前阅读相关文档。

- 产品概览：`docs/prd/00-overview.md`
- 用户流程与扫描：`docs/prd/01-user-flows.md`
- 归档与文件规则：`docs/prd/02-archive-rules.md`
- 查询与导出：`docs/prd/03-query-export.md`
- 待确认、编辑、删除：`docs/prd/04-review-crud.md`
- OCR 与 AI 规则：`docs/prd/05-ai-ocr-rules.md`
- 数据模型：`docs/prd/06-data-model.md`
- UI 设计：`docs/prd/07-ui-design.md`
- MVP 与路线图：`docs/prd/08-mvp-roadmap.md`
- 开发补充细则：`docs/development-rules.md`

## 什么时候读哪个文档

- 修改文件扫描、复制、删除、归档生成或重新归档逻辑时，读 `docs/prd/02-archive-rules.md`。
- 修改自然语言查询、类别筛选、证书匹配或导出时，读 `docs/prd/03-query-export.md`。
- 修改待确认卡片、人员合并/拆分、编辑、软删除或回收站时，读 `docs/prd/04-review-crud.md`。
- 修改 OCR、AI 抽取、Prompt、隐私或脱敏时，读 `docs/prd/05-ai-ocr-rules.md`。
- 修改迁移、SQLite 表、SQL 查询、repository 或数据服务时，读 `docs/prd/06-data-model.md`。
- 修改 React UI、交互、命令输入或布局时，读 `docs/prd/07-ui-design.md`。
- 修改测试策略、验证方式、E2E 预留或开发流程时，读 `docs/development-rules.md`。

## 架构规则

- Electron Main Process 和 Renderer 代码必须保持分离。
- React Renderer 不得直接调用 Node 文件系统 API。
- Renderer 应通过 preload / IPC 暴露的类型化 service API 调用本地能力。
- 文件系统操作应放在 Electron Main Process 或后端 service 模块中。
- 业务规则放在 domain/service 模块中，不写死在 UI 组件里。
- TypeScript 使用严格类型。
- IPC payload 和 service 返回值优先使用显式类型。
- 实现 UI 页面时可以先用 mock data。
- 没有明确理由不要引入大型依赖。

## 建议源码结构

当前阶段使用 electron-vite 默认结构，并逐步向清晰分层演进。

```text
electron/
  services/
    fileScanner.ts
    archiveWriter.ts
    hashService.ts
    ocrService.ts
    aiExtractService.ts
    exportService.ts
  db/
    migrations/
    repositories/
  ipc/
  main.ts
  preload.ts
src/
  components/
  pages/
  features/
  services/
  types/
docs/
  prd/
skills/
  qualidex-development-rules/
```

## UI 规则

- 目标用户是非技术业务用户。
- 主界面避免暴露 `import_batch`、`OCR pipeline`、`SQLite`、`AI extraction` 等技术词。
- 优先使用业务友好的中文：
  - 导入资料
  - 整理资料
  - 待确认
  - 查询人员
  - 导出结果
- 主 UI 应是单页工作台。
- 视觉风格：Notion / 飞书式结构化工作台 + ChatGPT 式命令输入。
- 查询类别控件必须支持多选标签。
- MVP 阶段查询结果和待确认项可以使用卡片。

## 数据规则

- 使用 `primary_category` 生成归档目录。
- 使用 `categories` 数组做查询解析和筛选。
- MVP 类别筛选使用 `primary_category IN (...)`。
- 除非明确实现真正的人员多类别，否则 `person_categories` 只作为未来扩展预留。
- 人工修改和高风险操作需要记录审计日志。
- 普通删除操作不得物理删除记录，应标记状态或删除字段。

## 文件操作安全清单

实现或修改文件操作前，必须确认：

- 是否触碰了原始资料文件？
- 是否可能移动或删除原始资料文件？
- 是否只复制到归档输出目录？
- 是否通过 hash 处理重复文件？
- 是否支持重新归档前预览？
- 是否为高风险变更写入操作日志？
- 是否保留可恢复性？

## 完成标准

任务结束前确认：

- 代码可以编译。
- TypeScript 没有明显类型错误。
- UI 行为符合相关 PRD 章节。
- 文件操作规则没有被违反。
- 如果任务触及数据模型，迁移或文档已更新。
- 如果任务触及查询解析，保留 `categories` 多选行为。
- 如果任务触及归档生成，保留 `primary_category` 单一主类别行为。
- 如果任务触及逻辑、UI、IPC 或桌面启动链路，按 `docs/development-rules.md` 执行对应验证。
