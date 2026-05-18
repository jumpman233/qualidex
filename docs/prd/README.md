# Qualidex PRD 文档索引

本目录由 `qualidex_prd_v1_2.md` 拆分而来，方便 Codex / 代码代理按任务读取相关文档。

## 文档列表

- `00-overview.md`：产品背景、目标、用户角色、技术栈、核心原则、最终结论。
- `01-user-flows.md`：首次导入、新增文件夹、重新扫描、文件扫描流程。
- `02-archive-rules.md`：归档结构、主类别、地区、人员文件夹、多人员资料、重新归档。
- `03-query-export.md`：证书匹配、自然语言查询、类别多选、导出规则。
- `04-review-crud.md`：人员归并、待确认、修改、删除、回收站。
- `05-ai-ocr-rules.md`：OCR、AI 输入输出、Prompt、隐私与脱敏。
- `06-data-model.md`：SQLite 表结构与后续 `person_categories` 扩展。
- `07-ui-design.md`：单页工作台、CommandBar、查询页、导入页、待确认页、导出页。
- `08-mvp-roadmap.md`：MVP 验收标准、开发优先级、风险与应对。

## Codex 使用建议

- 修改文件扫描、复制、删除、重新归档：先读 `02-archive-rules.md`。
- 修改查询、证书筛选、导出：先读 `03-query-export.md`。
- 修改待确认、人员合并、软删除：先读 `04-review-crud.md`。
- 修改 OCR / AI / Prompt：先读 `05-ai-ocr-rules.md`。
- 修改数据库 / migration / SQL：先读 `06-data-model.md`。
- 修改前端界面：先读 `07-ui-design.md`。
