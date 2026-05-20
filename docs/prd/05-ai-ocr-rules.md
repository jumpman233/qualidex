# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.4  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 9. 路径语义解析功能

### 9.1 路径信息范围

系统扫描文件时，应保留并解析路径相关信息。

路径信息包括：

```text
original_path       原始完整路径
source_root_path    来源根目录
relative_path       相对来源根目录的相对路径
parent_folder       直接父级文件夹
file_name           文件名
path_segments       路径层级数组
```

示例：

```text
D:\人员资料\工程\成都\张三\二建证.pdf
```

解析结果：

```json
{
  "original_path": "D:\\人员资料\\工程\\成都\\张三\\二建证.pdf",
  "source_root_path": "D:\\人员资料",
  "relative_path": "工程\\成都\\张三\\二建证.pdf",
  "parent_folder": "张三",
  "file_name": "二建证.pdf",
  "path_segments": ["工程", "成都", "张三", "二建证.pdf"]
}
```

### 9.2 路径语义候选结果

系统应根据路径信息生成候选判断，而不是直接作为最终结果。

候选结果包括：

```json
{
  "candidate_primary_category": "工程",
  "candidate_region": "成都",
  "candidate_person_name": "张三",
  "candidate_document_type": "license",
  "candidate_license_hint": "二建证",
  "confidence": 0.85,
  "evidence": [
    "路径层级第 1 层为工程",
    "路径层级第 2 层为成都",
    "父级文件夹为张三",
    "文件名包含二建证"
  ]
}
```

### 9.3 路径语义判断优先级

路径语义与 OCR / AI 抽取需要综合判断。

建议优先级：

```text
1. 用户导入时手动指定的主类别 / 地区
2. 明确目录层级中的主类别 / 地区 / 人员名
3. 文件名中的人员名 / 证书名 / 资料类型
4. OCR 文本中的结构化信息
5. AI 综合判断
6. 人工确认
```

注意：

- 用户手动指定优先级最高。
- 路径信息通常对主类别、地区、人员名很有参考价值。
- OCR 文本通常对证书名称、证书编号、颁发机构、有效期更有参考价值。
- 路径与 OCR 冲突时，不应自动覆盖，应进入待确认。

### 9.4 路径低信息量判断

以下文件夹名或路径片段信息量较低，不应作为高置信判断依据：

```text
新建文件夹
资料
扫描件
图片
照片
文件
临时
待整理
未命名
其他
```

如果路径主要由低信息量片段组成，应降低路径置信度。

### 9.5 路径冲突待确认

以下情况必须进入待确认：

- 路径中人员名与 OCR 识别人员名不一致。
- 路径中地区与证书文本或业务规则地区不一致。
- 路径中主类别与 OCR / AI 判断主类别不一致。
- 路径显示单人目录，但文件内容识别出多个人。
- 路径层级无法匹配预期结构。
- 文件名显示证书类型，但 OCR 识别为其他资料类型。

### 9.6 路径语义解析与 AI 的关系

路径语义解析可以先由规则完成，再作为 AI 输入的一部分。

AI 输入中应包含：

```json
{
  "file_name": "二建证.pdf",
  "original_path": "D:\\人员资料\\工程\\成都\\张三\\二建证.pdf",
  "source_root_path": "D:\\人员资料",
  "relative_path": "工程\\成都\\张三\\二建证.pdf",
  "parent_folder": "张三",
  "path_segments": ["工程", "成都", "张三", "二建证.pdf"],
  "path_parse_hint": {
    "candidate_primary_category": "工程",
    "candidate_region": "成都",
    "candidate_person_name": "张三",
    "candidate_document_type": "license",
    "candidate_license_hint": "二建证",
    "confidence": 0.85
  }
}
```

AI 应综合路径、文件名、OCR 文本进行结构化抽取。

路径信息不能替代人工确认。
## 10. OCR 与 AI 抽取功能

### 9.1 OCR 输入

OCR 输入包括：

```text
图片文件
PDF 页面截图或图片化页面
可提取文本的 PDF / Office 文档
```

### 9.2 AI 抽取输入

AI 输入不得包含原图，只包含：

```text
OCR 文本
文件名
原始路径
相对路径
路径层级数组
路径语义解析候选结果
上级文件夹名
用户指定主类别
用户指定地区
```

### 9.3 AI 抽取输出

AI 输出 JSON：

```json
{
  "document_type": "id_card | diploma | degree | license | unknown | other",
  "category": {
    "primary_value": "工程",
    "candidate_values": ["工程", "消防员"],
    "source": "user_input | folder_path | file_name | ocr_text | unknown",
    "confidence": 0.9,
    "needs_manual_review": false
  },
  "person": {
    "name": "张三",
    "id_card_last4": "1234"
  },
  "region": {
    "value": "成都",
    "source": "folder_path | file_name | ocr_text | unknown",
    "confidence": 0.85
  },
  "education": {
    "level": "大专",
    "school": "某某职业技术学院",
    "major": "建筑工程技术"
  },
  "license": {
    "raw_license_name": "二级建造师注册证书",
    "normalized_license_name": "二级建造师",
    "license_category": "建筑工程注册类执业资格",
    "issuing_authority": "某某住建部门",
    "valid_until": "2026-12-31",
    "issuer_authority": {
      "level": "unknown",
      "score": null,
      "source": "unknown",
      "reason": null,
      "review_status": "pending_review"
    },
    "is_license_candidate": true
  },
  "multi_person": {
    "is_multi_person_file": false,
    "detected_people": []
  },
  "confidence": 0.82,
  "needs_manual_review": true,
  "review_reasons": [
    "地区置信度较低"
  ],
  "evidence": [
    "OCR 中出现二级建造师",
    "OCR 中出现注册证书"
  ]
}
```

说明：

- AI 可以返回多个候选类别。
- 归档阶段必须确认一个 `primary_value`。
- 如果多个类别置信度接近，进入待确认。
- MVP 阶段不要求一个人员同时拥有多个正式类别。

---
## 21. AI Prompt 需求

### 20.1 OCR 后结构化抽取 Prompt

要求：

- 只能基于输入文本抽取。
- 不确定返回 null 或 unknown。
- 不允许编造。
- 必须输出 JSON。
- 必须给出 confidence。
- 必须给出 needs_manual_review。
- 必须给出 evidence。
- 必须识别主类别、候选类别、地区、人员、资料类型、学历、证书、颁发机构、多人员迹象，并综合路径语义解析结果。

类别字段输出要求：

```json
{
  "category": {
    "primary_value": "工程",
    "candidate_values": ["工程", "消防员"],
    "source": "folder_path | file_name | ocr_text | user_input | unknown",
    "confidence": 0.9,
    "needs_manual_review": false
  }
}
```

说明：

- `primary_value` 用于归档主类别。
- `candidate_values` 用于记录 AI 判断出的候选类别。
- 如果候选类别冲突或置信度接近，需要进入待确认。

证书颁发机构权威性字段输出要求，P2 预留：

```json
{
  "issuer_authority": {
    "level": "high | medium | low | unknown",
    "score": 0,
    "source": "manual | ai | rule | unknown",
    "reason": "判断依据",
    "review_status": "confirmed | pending_review | rejected"
  }
}
```

说明：

- MVP 阶段可默认输出 `unknown`。
- 如果 AI 能从文本中明显识别发证机关权威性，可以给出建议。
- AI 建议不能直接作为最终业务裁决。
- 人工确认结果优先。

证书官方 / 非官方标签规则：

- 人员证书需要支持一个用户手动维护的官方 / 非官方标签。
- AI 不得直接输出最终 `official_status`。
- AI 不得自动把证书判定为“官方”或“非官方”。
- AI 可以在 `evidence` 或待确认原因中提供与发证机关、证书来源、证书名称相关的证据。
- 最终标签只能由用户手动设置。
- 默认状态为 `null`，表示未判断。


### 20.2 查询解析 Prompt

要求：

- 将用户口语查询解析成结构化筛选条件。
- 类别必须输出为 `categories` 数组。
- 默认 `category_match_mode` 为 `any`。
- 不清楚的条件放入 ambiguities。
- 不直接返回最终人员结果。
- 查询结果必须由 SQL 根据确认条件产生。

示例：

```json
{
  "intent": "find_people",
  "categories": ["工程", "消防员"],
  "category_match_mode": "any",
  "region": "成都",
  "count": 3,
  "education_min": "大专",
  "license_query": "二建证",
  "require_complete_documents": true,
  "include_pending_review": false,
  "ambiguities": []
}
```

查询解析时：

- 如果用户说“工程和消防员”，解析为 `categories: ["工程", "消防员"]`。
- 默认含义是 OR，即属于任一类别即可。
- 如果用户明确说“同时属于工程和消防员”，返回 `category_match_mode: "all"`。
- MVP 阶段如果 `category_match_mode = "all"`，页面需要提示该能力暂不完整支持，默认按任一类别查询。

### 20.3 证书候选分组 Prompt

要求：

- 输入用户证书查询词和系统召回候选证书。
- 输出强匹配、可能相关、不建议。
- 给出解释。
- 不做最终合规裁决。
- 标记需要用户确认。

---
## 22. 隐私与安全

### 21.1 原图不上传

默认不上传：

```text
身份证原图
学历证原图
执业证原图
完整原始资料包
```

### 21.2 OCR 文本脱敏

上传 AI 前可脱敏：

```text
身份证号：仅保留后四位
手机号：替换为 [手机号]
证书编号：按需保留或替换
颁发机构：一般可以保留，用于判断证书权威性
姓名：按业务需要决定是否保留
```

### 21.3 操作日志

记录：

```text
扫描日志
OCR 日志
AI 抽取日志
人工确认日志
修改日志
删除日志
导出日志
重新归档日志
```

---
