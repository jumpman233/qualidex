# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.2  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 9. OCR 与 AI 抽取功能

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
## 20. AI Prompt 需求

### 20.1 OCR 后结构化抽取 Prompt

要求：

- 只能基于输入文本抽取。
- 不确定返回 null 或 unknown。
- 不允许编造。
- 必须输出 JSON。
- 必须给出 confidence。
- 必须给出 needs_manual_review。
- 必须给出 evidence。
- 必须识别主类别、候选类别、地区、人员、资料类型、学历、证书、多人员迹象。

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
## 21. 隐私与安全

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
