# UI 蓝图实现说明

## 当前范围

本阶段属于 P1-0 页面 UI 蓝图，只用于确认 Qualidex 桌面工作台的信息结构、视觉方向和主要页面状态。

当前实现：

- 完全替换旧 P0 页面。
- 默认进入 `home` 空状态。
- 使用 mock data 展示示例数据。
- 不接真实 Electron API。
- 不读取真实 SQLite 数据。
- 不执行文件扫描、复制、删除、归档或导出。
- 不调用真实 OCR / AI 服务。

## 设计输入

- UI 参考图：`docs/ui/ui.png`
- 页面要求：`docs/ui/design-require.md`
- UI PRD：`docs/prd/07-ui-design.md`
- 开发规则：`AGENTS.md`、`docs/development-rules.md`

## 当前组件结构

```text
src/
  App.tsx
  App.css
  components/
    AppShell.tsx
    CommandBar.tsx
    OverviewCards.tsx
    Sidebar.tsx
    MainWorkspace.tsx
  mock/
    qualidexMock.ts
```

组件职责：

- `AppShell`：顶部栏、品牌、资料库、设置、帮助入口。
- `CommandBar`：智能输入框与快捷操作入口。
- `OverviewCards`：已整理人员、待确认资料、最近新增、导出记录。
- `Sidebar`：工作区导航与最近操作。
- `MainWorkspace`：根据 `workspaceMode` 展示 `home / search / import / review / export`。
- `qualidexMock.ts`：当前 UI 蓝图使用的 mock 数据。

## Workspace 现状

### home

默认空状态，用于提示用户从智能输入框或常用操作开始。

### search

当前仅做 mock 流程：

1. 展示“系统理解的查询条件”。
2. 点击“确认查询”后展示 mock 查询结果。
3. 点击“修改条件”回到条件确认状态。

正式接入时注意：

- 查询类别必须支持多选。
- `工程 + 消防员` 默认按任一类别命中。
- 最终结果必须基于已确认结构化数据和 SQL，不能直接使用 AI 结果作为最终结果。
- 修改自然语言查询、类别筛选、证书匹配或导出前，先读 `docs/prd/03-query-export.md`。

### import

当前仅展示新增资料表单、整理进度和完成摘要。

正式接入时注意：

- 原始资料目录只读。
- 不得移动、覆盖或删除原始资料文件。
- 文件系统操作必须在 Electron Main Process 或后端 service 中完成。
- Renderer 只能通过 preload / IPC 调用本地能力。
- 修改文件扫描、复制、删除、归档生成或重新归档逻辑前，先读 `docs/prd/02-archive-rules.md`。

### review

当前使用卡片展示待确认项，并展示静态可编辑字段。

正式接入时注意：

- 低置信度 OCR / AI 结果必须进入待确认。
- AI 只提供建议和结构化抽取，不做最终裁决。
- 人工确认、修改、忽略等操作需要写入数据库，并保留审计日志。
- 修改待确认卡片、人员合并/拆分、编辑、软删除或回收站前，先读 `docs/prd/04-review-crud.md`。

### export

当前展示导出内容、导出位置、人员预览和风险提示。

正式接入时注意：

- 导出结果必须基于已确认结构化数据和 SQL。
- 文件夹导出只能复制到用户选择的输出目录。
- 多人员共用资料必须提示风险。
- 归档目录是数据库事实源生成的输出结果，不代表原始资料目录。
- 修改导出逻辑前，先读 `docs/prd/03-query-export.md` 和 `docs/prd/02-archive-rules.md`。

## 正式接入前必读规则

后续从 UI 蓝图进入真实能力接入时，必须先回到 `AGENTS.md`，并根据触及范围阅读对应 PRD。

必须持续遵守：

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

## 后续接入点

- 查询解析：接入 AI 查询解析服务，展示结构化条件，用户确认后执行 SQL。
- 扫描导入：接入目录选择、扫描、hash、OCR、AI 抽取和导入批次状态。
- 待确认：从 `review_items` 读取待确认项，支持确认、修改、跳过和审计日志。
- 归档：展示归档计划和变更预览，确认后只复制到归档输出目录。
- 导出：接入 Excel 导出和人员资料文件夹复制，保留多人员资料风险提示。

## 验证记录

当前 UI 蓝图阶段已执行：

```text
pnpm run lint
pnpm run build
```

使用 `pnpm run dev` 做过本地桌面启动和首屏截图检查。正式接入真实能力后，需要根据 `docs/development-rules.md` 增加对应验证。
