# 03-query-export.md

# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.4  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 13. 证书匹配功能

### 13.1 入库阶段

每个疑似证书生成 license_search_text

示例：

证书名称：二级建造师注册证书  
归一化名称：二级建造师  
证书类别：建筑工程注册类执业资格  
常见别名：二建、二建证、二级建造师证  
发证机关：住房和城乡建设部门  
OCR 关键文本：二级建造师、注册证书、注册编号、执业单位、有效期  
AI 判断依据：文本中出现“二级建造师”“注册证书”“执业单位”

对该文本生成 embedding，写入 sqlite-vec。

### 13.2 查询阶段

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
用户勾选认可证书  
↓  
SQL 精确查询人员

### 13.3 分组展示

强匹配  
[x] 二级建造师注册证书  
[x] 二级建造师执业资格证书  

可能相关  
[ ] 二级建造师继续教育证明  
[ ] 建造师培训合格证  

不建议  
[ ] 施工员岗位证书  

AI 仅做建议，用户最终确认。

### 13.4 证书颁发机构权威性，P2 预留

字段预留：

issuer_authority_level: high | medium | low | unknown  
issuer_authority_score: 0–100  
issuer_authority_source: manual | ai | rule | unknown  
issuer_authority_review_status: confirmed | pending_review | rejected  

原则：

- 人工标记优先  
- AI / 规则仅作建议  
- 不确定进入待确认  
- `recognition_status` 表示业务认可  
- `issuer_authority_*` 表示颁发机构权威性 / 正当性 / 可信度  

示例：

证书 A：  
- 证书名称：二级建造师注册证书  
- 发证机构：住房和城乡建设相关主管部门  
- issuer_authority_level：high  
- recognition_status：recognized  

证书 B：  
- 证书名称：消防培训合格证  
- 发证机构：某培训学校  
- issuer_authority_level：low  
- recognition_status：uncertain  

P2 阶段可扩展独立 issuers 表维护机构权威性库、别名及人工确认。

## 14. 查询功能

### 14.1 自然语言查询

示例：

找工程和消防员里成都 3 个大专以上、有二建证、资料齐全的人

AI 解析结果：

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
  "output": { "excel": true, "copy_folder": true, "zip": false },
  "ambiguities": []
}

### 14.2 条件确认

类别：[工程] [消防员]  
地区：成都  
人数：3  
学历：大专以上  
证书：二建证  
资料完整度：优先资料齐全  
是否包含待确认：否  

类别展示建议标签形式，多选控件  
默认语义：工程 或 消防员  

### 14.3 高级筛选

字段：类别、地区、学历、证书、证书状态、证书官方/非官方标签、资料完整度、是否包含待确认、是否包含多人员资料、导入批次

### 14.4 查询结果字段

选择、姓名、主类别、地区、学历、证书、证书状态、证书官方/非官方标签、资料完整度、是否待确认、是否包含多人员资料、文件夹路径、匹配原因、操作

操作：查看资料、打开文件夹、复制路径、加入导出

### 14.5 颁发机构权威性查询，P2 预留

查询示例：找成都有二建证，并且颁发机构权威性高的人

AI 解析结果预留：

{
  "license_query": "二建证",
  "issuer_authority_min_score": 70,
  "issuer_authority_levels": ["high", "medium"]
}

SQL 层可按预留字段筛选：  
WHERE issuer_authority_score >= 70

### 14.6 查询 SQL 规则

类别查询使用主类别字段，示例：

SELECT *  
FROM people  
WHERE status = 'active'  
AND primary_category IN ('工程', '消防员')  
AND region = '成都';

未选择类别则不加限制

## 15. 导出功能

### 15.1 Excel 导出

字段：姓名、主类别、地区、身份证后四位、学历、证书名称、证书状态、证书官方/非官方标签、资料完整度、是否待确认、是否包含多人员资料、文件夹路径、匹配原因

### 15.2 文件夹导出

选中人员资料复制到导出目录：

导出结果/  
  人员清单.xlsx  
  人员资料/  
    张三_1234/  
    李四_5678/

### 15.3 多人员资料导出提示

提示：该人员存在多人员共用资料，导出文件中可能包含其他人员信息  
用户可选择：包含多人员资料 / 不包含 / 仅导出清单中标记路径

### 15.4 证书颁发机构权威性导出提示，P2 预留

字段：颁发机构、颁发机构权威性等级、颁发机构权威性分数、权威性判断来源、权威性确认状态、权威性判断原因

MVP 阶段可保留 issuing_authority 字段，不强制显示权威性评分

### 15.5 证书官方/非官方标签导出

字段：证书官方标签  
显示值：官方 / 非官方 / 未判断  
说明：该标签由用户手动维护 licenses.official_status，默认 null 显示“未判断”，AI / OCR 不自动标记

### 15.6 多类别查询导出提示

提示：本次导出类别范围：工程、消防员，类别匹配方式：任一类别匹配  
避免误以为结果人员同时属于多个类别