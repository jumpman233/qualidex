# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.4  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 13. 证书匹配功能

### 12.1 入库阶段

每个疑似证书生成 license_search_text。

示例：

```text
证书名称：二级建造师注册证书
归一化名称：二级建造师
证书类别：建筑工程注册类执业资格
常见别名：二建、二建证、二级建造师证
发证机关：住房和城乡建设部门
OCR 关键文本：二级建造师、注册证书、注册编号、执业单位、有效期
AI 判断依据：文本中出现“二级建造师”“注册证书”“执业单位”
```

对该文本生成 embedding，写入 sqlite-vec。

### 12.2 查询阶段

流程：

```text
用户输入自然语言查询
  ↓
AI 解析 license_query
  ↓
AI 扩展证书别名
  ↓
生成 query_search_text
  ↓
query embedding
  ↓
sqlite-vec 召回 topK 证书
  ↓
按证书名称聚合
  ↓
AI 分组解释
  ↓
用户勾选本次认可证书
  ↓
SQL 精确查询人员
```

### 12.3 分组展示

展示为：

```text
强匹配
[x] 二级建造师注册证书
[x] 二级建造师执业资格证书

可能相关
[ ] 二级建造师继续教育证明
[ ] 建造师培训合格证

不建议
[ ] 施工员岗位证书
```

AI 只做建议，用户最终确认。

---

### 12.4 证书颁发机构权威性，P2 预留

部分证书虽然名称相近，但颁发机构的权威性、正当性和业务认可度可能不同。

系统需要在设计层面预留“颁发机构权威性”能力，用于表达：

- 发证机构是否权威。
- 发证机构是否正规。
- 证书是否来自业务认可机构。
- 该判断来自人工、AI、规则还是未知来源。
- 该判断是否已经被人工确认。

该能力优先级为 P2，MVP 阶段不强制实现完整机构库和机构评分流程，但需要在数据模型中预留空间。

建议字段概念：

```text
issuer_authority_level
issuer_authority_score
issuer_authority_source
issuer_authority_reason
issuer_authority_review_status
```

字段含义：

```text
issuer_authority_level:
- high
- medium
- low
- unknown

issuer_authority_score:
- 0 到 100 的整数分数

issuer_authority_source:
- manual
- ai
- rule
- unknown

issuer_authority_review_status:
- confirmed
- pending_review
- rejected
```

设计原则：

- 人工标记优先级最高。
- AI / 规则识别只能作为建议。
- 不确定时进入待确认。
- 颁发机构权威性不应混入 `recognition_status`。
- `recognition_status` 表示证书在本次业务中是否认可。
- `issuer_authority_*` 表示颁发机构本身的权威性 / 正当性 / 可信度。

示例：

```text
证书 A：
- 证书名称：二级建造师注册证书
- 发证机构：住房和城乡建设相关主管部门
- issuer_authority_level：high
- recognition_status：recognized

证书 B：
- 证书名称：消防培训合格证
- 发证机构：某某培训学校
- issuer_authority_level：low
- recognition_status：uncertain
```

P2 阶段可扩展独立 `issuers` 表，用于维护颁发机构权威性库、机构别名和人工确认结果。
## 14. 查询功能

### 13.1 自然语言查询

示例：

```text
找工程和消防员里成都 3 个大专以上、有二建证、资料齐全的人
```

AI 解析结果：

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
  "output": {
    "excel": true,
    "copy_folder": true,
    "zip": false
  },
  "ambiguities": []
}
```

说明：

- `categories` 是数组。
- `category_match_mode` 默认是 `any`。
- `any` 表示属于任一类别即可。
- MVP 阶段主要支持 `any`。
- 如果 AI 解析为 `all`，页面提示当前版本默认按任一类别匹配。

### 13.2 条件确认

页面展示系统理解：

```text
类别：[工程] [消防员]
地区：成都
人数：3
学历：大专以上
证书：二建证
资料完整度：优先资料齐全
是否包含待确认：否
```

类别展示建议使用标签形式：

```text
类别：[工程] [消防员]
```

用户点击“修改条件”时，类别控件应为多选控件，而不是单选下拉。

类别多选默认语义为：

```text
工程 或 消防员
```

不是：

```text
同时属于工程和消防员
```

如果用户明确表达“同时属于工程和消防员”，MVP 阶段应提示：

```text
当前版本按任一类别匹配。如需同时属于多个类别，需要后续启用多类别人员模型。
```

### 13.3 高级筛选

支持字段：

```text
类别，支持多选
地区
学历
证书
证书状态
资料完整度
是否包含待确认
是否包含多人员资料
导入批次
```

### 13.4 查询结果字段

结果表字段：

```text
选择
姓名
主类别
地区
学历
证书
证书状态
资料完整度
是否待确认
是否包含多人员资料
文件夹路径
匹配原因
操作
```

操作：

```text
查看资料
打开文件夹
复制路径
加入导出
```

### 13.5 颁发机构权威性查询，P2 预留

未来可支持用户输入：

```text
找成都有二建证，并且颁发机构权威性高的人
```

AI 解析结果可预留：

```json
{
  "license_query": "二建证",
  "issuer_authority_min_score": 70,
  "issuer_authority_levels": ["high", "medium"]
}
```

SQL 层可按预留字段筛选：

```sql
WHERE issuer_authority_score >= 70
```

MVP 阶段该能力不进入核心查询流程，仅在数据模型和 Prompt 设计中预留。

### 13.6 查询 SQL 规则

MVP 阶段类别查询使用主类别字段。

示例：

```sql
SELECT *
FROM people
WHERE status = 'active'
AND primary_category IN ('工程', '消防员')
AND region = '成都';
```

如果用户未选择类别，则不添加类别限制。

---
## 15. 导出功能

### 14.1 Excel 导出

Excel 字段：

```text
姓名
主类别
地区
身份证后四位
学历
证书名称
证书状态
资料完整度
是否待确认
是否包含多人员资料
文件夹路径
匹配原因
```

### 14.2 文件夹导出

将选中人员资料复制到导出目录：

```text
导出结果/
  人员清单.xlsx
  人员资料/
    张三_1234/
    李四_5678/
```

### 14.3 多人员资料导出提示

如果人员关联了多人员 PDF，需要提示：

```text
该人员存在多人员共用资料，导出文件中可能包含其他人员信息。
```

用户可选择：

```text
包含多人员资料
不包含多人员资料
仅导出清单中标记路径
```

### 14.4 证书颁发机构权威性导出提示，P2 预留

如果未来启用颁发机构权威性评估，导出 Excel 可增加字段：

```text
颁发机构
颁发机构权威性等级
颁发机构权威性分数
权威性判断来源
权威性确认状态
权威性判断原因
```

MVP 阶段可以只保留 `issuing_authority` 字段，不强制展示权威性评分。

### 14.5 多类别查询导出提示

如果本次查询选择了多个类别，需要在导出说明中展示：

```text
本次导出类别范围：工程、消防员
类别匹配方式：任一类别匹配
```

避免业务方误以为结果人员同时属于多个类别。

---
