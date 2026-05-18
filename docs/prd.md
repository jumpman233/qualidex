# 人员资料归档与资质查询工具 PRD

> 版本：V1.1  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API  
> 核心目标：对散乱人员资料进行本地扫描、结构化识别、分类归档、人工确认、条件查询和资料导出。  
> 重要原则：原始文件不移动、不删除；数据库是事实源；归档目录是根据数据库生成的复制结果。

---

## 1. 项目背景

业务方手上存在大量人员资料文件，可能来自百度网盘同步目录、本地文件夹、历史压缩包或人工整理目录。资料类型可能包括：

- 身份证
- 学历证明
- 学位证明
- 执业执照
- 职业资格证
- 注册证书
- 培训证明
- 其他人员相关材料

这些资料可能存在以下问题：

- 文件夹结构不统一
- 文件名不规范
- 一个人的资料散落在多个目录
- 多个人员资料出现在同一个 PDF 或图片集合中
- 地区信息不稳定
- 证书名称不标准
- 同名人员难以区分
- 大量图片需要 OCR
- 人工查找人员和证书效率低

本工具目标不是做一个普通文件浏览器，也不是做 RAG 问答系统，而是一个本地人员资料治理工具。

---

## 2. 产品目标

### 2.1 核心目标

系统需要支持：

1. 选择本地资料目录并扫描文件。
2. 对图片 / PDF 等资料进行 OCR 或文本抽取。
3. 使用 AI 对 OCR 后文本进行结构化抽取。
4. 识别人员、地区、类别、学历、证书等信息。
5. 将资料按统一规则复制到新的归档目录。
6. 对低置信度结果进入待确认流程。
7. 支持按地区、类别、学历、证书等条件查询人员。
8. 支持导出 Excel、复制人员资料文件夹、生成后续可压缩的导出目录。
9. 支持新增部分文件夹。
10. 支持人员、文件、证书、归档信息的修改和软删除。
11. 支持重新生成归档结果。

### 2.2 不做什么

MVP 阶段暂不做：

1. 不直接上传身份证、学历证、证书原图到云端 AI。
2. 不物理删除原始资料。
3. 不做多用户权限系统。
4. 不做 Web 服务端部署。
5. 不做完整自动化证书合规裁决。
6. 不做 100% 无人工确认的全自动归档。
7. 不强制自动拆分多人员 PDF。
8. 不使用 Rust CLI 作为第一版必要依赖。
9. 不做大规模 RAG 问答。

---

## 3. 用户角色

### 3.1 资料整理人员

主要使用者。负责：

- 选择资料目录
- 启动扫描
- 查看待确认项
- 修正人员和资料信息
- 生成归档目录
- 查询并导出资料

### 3.2 业务负责人

偶尔使用或查看结果。关注：

- 某地区是否有符合条件人员
- 某类证书人员数量
- 查询结果是否可靠
- 导出资料是否完整

---

## 4. 技术栈要求

### 4.1 桌面应用

采用：

```text
Electron
electron-vite
React
TypeScript
```

项目初始化建议：

```bash
npm create electron-vite@latest personnel-archive
```

选择：

```text
Framework: React
Variant: TypeScript
```

### 4.2 本地数据库

采用：

```text
SQLite
sqlite-vec
```

用途：

- SQLite 存储人员、文件、证书、归档、导入批次、待确认项等结构化数据。
- sqlite-vec 存储证书语义向量，用于证书候选召回。

### 4.3 OCR

优先采用本地 OCR：

```text
PaddleOCR
```

调用方式：

```text
Electron Main Process
  ↓
调用 Python OCR 脚本或本地 OCR 服务
  ↓
返回 OCR 文本
```

MVP 可以先将 OCR 作为可替换模块实现，不强绑定具体 OCR 引擎。

### 4.4 AI API

AI 只处理 OCR 后文本，不直接处理原图。

AI 用于：

1. OCR 后文本结构化抽取。
2. 用户自然语言查询解析。
3. 证书候选分组解释。
4. 证书查询词扩展。

---

## 5. 核心产品原则

### 5.1 原始资料不动

系统不得移动、覆盖、删除原始资料。

所有归档操作都只作用于新的归档输出目录。

```text
原始资料目录：只读
归档输出目录：系统生成
```

### 5.2 数据库是事实源

系统以数据库中的结构化信息作为事实源。

归档目录只是根据数据库生成出来的结果。

```text
原始文件：不可变来源
数据库：结构化事实源
归档目录：生成结果
```

### 5.3 低置信度必须待确认

以下情况必须进入待确认：

- 未识别人员
- 同名冲突
- 身份证后四位缺失
- 地区不确定
- 类别不确定
- 文件类型不确定
- 学历不确定
- 证书名称不确定
- 证书是否认可不确定
- OCR 失败
- 多人员资料无法拆分或无法明确归属

### 5.4 AI 只做辅助，不做最终裁决

AI 可以抽取、建议、分组、解释，但最终查询、导出和证书认可应基于：

```text
结构化数据库
人工确认结果
SQL 精确查询
```

---

## 6. 归档目录规则

### 6.1 标准归档结构

归档输出目录结构为：

```text
归档输出/
  类别/
    地区/
      人员姓名_唯一标识/
        01_身份证/
        02_学历/
        03_执业执照/
        04_其他资料/
```

示例：

```text
归档输出/
  工程/
    成都/
      张三_1234/
        01_身份证/
        02_学历/
        03_执业执照/
        04_其他资料/
      李四_5678/
        01_身份证/
        03_执业执照/
    未划分区域/
      王五_9012/
  环境/
    重庆/
      赵六_3344/
  消防员/
    绵阳/
      钱七_5566/
```

### 6.2 类别规则

第一层类别包括：

```text
工程
环境
消防员
未识别类别
```

类别来源包括：

1. 用户导入时手动指定。
2. 原始文件夹路径。
3. 原始文件名。
4. OCR 文本。
5. AI 抽取结果。
6. 人工确认。

数据库需要记录：

```text
category
category_source
category_confidence
```

### 6.3 地区规则

第二层地区包括：

```text
已识别地区
未划分区域
```

地区不按籍贯判断。

地区来源包括：

1. 用户导入时手动指定。
2. 原始文件夹路径。
3. 原始文件名。
4. 已有人员台账。
5. 证书文本。
6. 业务方指定规则。
7. 人工确认。

数据库需要记录：

```text
region
region_source
region_confidence
```

### 6.4 人员文件夹规则

人员文件夹命名：

```text
人员姓名_唯一标识
```

优先使用：

```text
姓名_身份证后四位
```

示例：

```text
张三_1234
```

如果身份证后四位缺失，则使用系统人员编号：

```text
张三_P000123
```

并进入待确认。

### 6.5 资料类型规则

人员目录下资料类型包括：

```text
01_身份证
02_学历
03_执业执照
04_其他资料
99_待确认
```

文件类型无法判断时进入：

```text
99_待确认
```

### 6.6 多人员资料规则

如果一个 PDF 或图片文件中包含多个人员资料，不直接归入某一个人员目录。

统一放入：

```text
归档输出/
  类别/
    地区/
      _多人员资料/
        多人员资料_文件名或编号/
          原始文件.pdf
          关联人员清单.xlsx
```

数据库中建立文件和多个人员之间的关联关系。

MVP 阶段不强制自动拆分多人员 PDF，只做识别、关联、待确认和导出提醒。

---

## 7. 核心业务流程

### 7.1 首次全量导入流程

```text
用户选择原始资料目录
  ↓
用户选择归档输出目录
  ↓
可选：用户指定默认类别 / 默认地区
  ↓
系统创建 import_batch
  ↓
递归扫描文件
  ↓
计算文件 sha256
  ↓
写入 files 表
  ↓
OCR / 文本抽取
  ↓
AI 结构化抽取
  ↓
人员归并
  ↓
证书识别
  ↓
生成待确认项
  ↓
生成归档计划
  ↓
用户处理待确认
  ↓
执行复制式归档
```

### 7.2 新增文件夹导入流程

新增部分文件夹和扫描本质上都是导入任务。

```text
用户选择新增资料目录
  ↓
选择导入方式：新增文件夹
  ↓
可选：指定类别 / 地区
  ↓
创建 import_batch
  ↓
扫描文件
  ↓
计算 hash
  ↓
已存在文件跳过
  ↓
新文件进入 OCR / AI 抽取
  ↓
更新人员、证书、待确认项
  ↓
生成归档变更预览
  ↓
用户确认后更新归档输出目录
```

### 7.3 重新扫描指定文件夹流程

用于 OCR 失败、AI 抽取规则变更、用户希望重新处理某一批文件。

```text
用户选择历史导入批次或指定目录
  ↓
选择重新扫描
  ↓
选择处理范围：
    - 仅失败文件
    - 全部重新 OCR
    - 全部重新 AI 抽取
    - 重新生成归档
  ↓
执行任务
  ↓
保留旧记录和操作日志
```

---

## 8. 文件扫描功能

### 8.1 支持文件类型

MVP 支持：

```text
jpg
jpeg
png
webp
pdf
doc
docx
xls
xlsx
txt
```

其中：

- 图片：进入 OCR。
- PDF：MVP 可先支持基本文本提取和整份文件 OCR；复杂按页拆分后置。
- Office 文档：优先提取文本；无法处理则进入待确认。
- 压缩包：MVP 可先识别并提示，不自动深度解压。

### 8.2 扫描记录字段

每个文件记录：

```text
original_path
file_name
ext
size_bytes
sha256
mime_type
source_batch_id
source_root_path
parent_folder
scan_status
ocr_status
process_status
process_error
created_at
updated_at
```

### 8.3 重复文件判断

通过 sha256 判断重复文件。

规则：

```text
sha256 一致：视为同一文件内容
路径不同但 hash 相同：记录重复来源
默认不重复 OCR，不重复 AI 抽取
```

---

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
用户指定类别
用户指定地区
```

### 9.3 AI 抽取输出

AI 输出 JSON：

```json
{
  "document_type": "id_card | diploma | degree | license | unknown | other",
  "category": {
    "value": "工程",
    "source": "user_input | folder_path | file_name | ocr_text | unknown",
    "confidence": 0.9
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

---

## 10. 人员归并功能

### 10.1 归并规则

人员归并优先级：

```text
1. 姓名 + 身份证后四位一致：高置信度同一人
2. 姓名 + 地区 + 类别一致：疑似同一人
3. 姓名一致但地区不同：进入待确认
4. 姓名一致但类别不同：进入待确认
5. 无姓名或无唯一标识：进入待确认
```

### 10.2 同名冲突

当出现同名人员时，页面应提示：

```text
检测到同名人员：
- 张三_1234，工程 / 成都
- 张三_5678，工程 / 重庆
- 张三_P000091，未划分区域

请选择当前文件归属人员，或新建人员。
```

### 10.3 人员合并与拆分

需要支持：

```text
合并人员
拆分人员
更换文件关联人员
```

所有操作写入操作日志。

---

## 11. 待确认功能

### 11.1 待确认类型

待确认项包括：

```text
person_unknown
person_merge_conflict
category_unknown
region_unknown
document_type_unknown
license_uncertain
license_recognition_uncertain
education_uncertain
multi_person_file
ocr_failed
ai_extract_failed
```

### 11.2 待确认页面能力

页面需要支持：

1. 查看原始文件。
2. 打开原始文件所在目录。
3. 查看 OCR 文本。
4. 查看 AI 抽取结果。
5. 修改类别。
6. 修改地区。
7. 修改人员。
8. 修改资料类型。
9. 修改证书名称。
10. 修改证书是否认可。
11. 标记为多人员资料。
12. 标记为忽略。
13. 确认归档路径。

### 11.3 批量确认

MVP 可支持简单批量操作：

```text
批量设置类别
批量设置地区
批量标记为其他资料
批量忽略
```

---

## 12. 证书匹配功能

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

## 13. 查询功能

### 13.1 自然语言查询

示例：

```text
找成都 3 个大专以上、有二建证、资料齐全的人
```

AI 解析结果：

```json
{
  "intent": "find_people",
  "category": "工程",
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

### 13.2 条件确认

页面展示系统理解：

```text
类别：工程
地区：成都
人数：3
学历：大专以上
证书：二建证
资料完整度：优先资料齐全
是否包含待确认：否
```

用户确认后再查询。

### 13.3 高级筛选

支持字段：

```text
类别
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
类别
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

---

## 14. 导出功能

### 14.1 Excel 导出

Excel 字段：

```text
姓名
类别
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

---

## 15. 修改功能

### 15.1 可修改对象

支持修改：

```text
人员信息
- 姓名
- 身份证后四位
- 类别
- 地区
- 学历
- 人员合并 / 拆分

文件信息
- 资料类型
- 关联人员
- 是否多人员资料
- 是否忽略
- OCR 文本修正

证书信息
- 原始证书名
- 归一化证书名
- 是否认可
- 有效期
- 证书类别
```

### 15.2 修改流程

```text
用户修改结构化信息
  ↓
写入数据库
  ↓
写入 audit_logs
  ↓
相关人员 / 文件标记 archive_dirty
  ↓
用户查看归档变更预览
  ↓
确认后重新生成归档
```

### 15.3 归档变更预览

示例：

```text
即将执行以下变更：
- 张三_1234 从 工程/未划分区域 移动到 工程/成都
- 文件 A 从 99_待确认 移动到 03_执业执照
- 多人员PDF_001 新增关联人员：李四_5678
```

这里的“移动”只作用于归档输出目录，不作用于原始资料目录。

---

## 16. 删除功能

### 16.1 删除归档结果

安全级别最高。

作用：

```text
只删除归档输出目录中的复制文件
不删除原始文件
不删除数据库记录
```

用于重新生成归档、清理错误输出。

### 16.2 从系统中移除文件

文件软删除。

```text
文件不再参与查询
文件不再参与归档
原始文件不删除
可从回收站恢复
```

数据库字段：

```text
archive_status = deleted
deleted_at
deleted_reason
```

### 16.3 删除人员

人员软删除。

删除前提示：

```text
该人员关联：
- 身份证 1 个
- 学历 1 个
- 证书 3 个
- 多人员 PDF 2 个

删除后：
- 不再出现在查询结果
- 不再参与导出
- 原始文件不会删除
- 可在回收站恢复
```

### 16.4 回收站

回收站支持：

```text
查看已删除人员
查看已删除文件
恢复人员
恢复文件
彻底清理归档输出副本
```

MVP 不支持物理删除原始资料。

---

## 17. 重新归档功能

支持重新生成：

```text
全部归档
指定类别归档
指定地区归档
指定人员归档
指定导入批次归档
脏数据归档
```

重新归档流程：

```text
读取数据库事实源
  ↓
生成归档计划
  ↓
展示变更预览
  ↓
用户确认
  ↓
清理旧归档副本
  ↓
复制文件到新目录
  ↓
生成归档报告
```

---

## 18. 页面设计

### 18.1 数据源与导入页

功能：

- 选择原始资料目录
- 选择归档输出目录
- 选择数据库文件
- 选择导入方式：
  - 首次全量导入
  - 新增文件夹
  - 重新扫描指定文件夹
- 手动指定类别
- 手动指定地区
- 开始导入

### 18.2 扫描处理页

展示：

- 当前导入批次
- 总文件数
- 新增文件数
- 重复文件数
- OCR 成功数
- OCR 失败数
- AI 抽取成功数
- 待确认数量
- 当前处理文件
- 错误列表

操作：

- 开始
- 暂停
- 继续
- 停止
- 重新处理失败项

### 18.3 待确认页

功能：

- 待确认列表
- 按类型筛选
- 查看文件
- 查看 OCR 文本
- 查看 AI 抽取结果
- 修改结构化信息
- 确认
- 批量处理

### 18.4 人员详情页

展示：

- 基本信息
- 类别 / 地区
- 学历
- 证书
- 关联文件
- 多人员资料
- 待确认项
- 操作日志

操作：

- 编辑人员
- 合并人员
- 拆分人员
- 打开归档文件夹
- 重新生成该人员归档
- 删除人员

### 18.5 查询页

功能：

- 自然语言查询框
- AI 解析结果确认
- 证书候选确认
- 高级筛选
- 候选人员列表
- 导出操作

### 18.6 导出页

功能：

- 查看导出记录
- 打开导出目录
- 重新导出
- 查看人员清单
- 查看导出日志

### 18.7 回收站页

功能：

- 查看已删除人员
- 查看已删除文件
- 恢复
- 清理归档副本

---

## 19. 数据库设计

### 19.1 people

```sql
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT,
  id_card_last4 TEXT,
  id_card_hash TEXT,
  category TEXT,
  category_source TEXT,
  category_confidence REAL,
  region TEXT,
  region_source TEXT,
  region_confidence REAL,
  education_level TEXT,
  education_school TEXT,
  education_major TEXT,
  review_status TEXT,
  status TEXT DEFAULT 'active',
  archive_dirty INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_reason TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 19.2 files

```sql
CREATE TABLE files (
  id TEXT PRIMARY KEY,
  original_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  ext TEXT,
  size_bytes INTEGER,
  sha256 TEXT,
  mime_type TEXT,
  source_batch_id TEXT,
  source_root_path TEXT,
  parent_folder TEXT,
  ocr_text TEXT,
  ocr_status TEXT,
  process_status TEXT,
  process_error TEXT,
  archive_status TEXT DEFAULT 'pending',
  is_multi_person_file INTEGER DEFAULT 0,
  deleted_at TEXT,
  deleted_reason TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 19.3 import_batches

```sql
CREATE TABLE import_batches (
  id TEXT PRIMARY KEY,
  batch_type TEXT,
  source_path TEXT,
  default_category TEXT,
  default_region TEXT,
  status TEXT,
  total_files INTEGER,
  new_files INTEGER,
  duplicate_files INTEGER,
  failed_files INTEGER,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 19.4 person_documents

```sql
CREATE TABLE person_documents (
  id TEXT PRIMARY KEY,
  person_id TEXT,
  file_id TEXT,
  document_type TEXT,
  target_category TEXT,
  relation_type TEXT,
  confidence REAL,
  needs_review INTEGER,
  review_reason TEXT,
  target_path TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);
```

### 19.5 licenses

```sql
CREATE TABLE licenses (
  id TEXT PRIMARY KEY,
  person_id TEXT,
  file_id TEXT,
  category TEXT,
  region TEXT,
  raw_license_name TEXT,
  normalized_license_name TEXT,
  license_category TEXT,
  issuing_authority TEXT,
  valid_until TEXT,
  recognition_status TEXT,
  recognition_reason TEXT,
  confidence REAL,
  needs_review INTEGER,
  ocr_text TEXT,
  extracted_evidence TEXT,
  license_search_text TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT,
  updated_at TEXT
);
```

### 19.6 review_items

```sql
CREATE TABLE review_items (
  id TEXT PRIMARY KEY,
  item_type TEXT,
  ref_id TEXT,
  reason TEXT,
  status TEXT,
  suggested_value TEXT,
  confirmed_value TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 19.7 export_jobs

```sql
CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  query_text TEXT,
  parsed_conditions TEXT,
  selected_people TEXT,
  output_type TEXT,
  output_path TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);
```

### 19.8 license_match_logs

```sql
CREATE TABLE license_match_logs (
  id TEXT PRIMARY KEY,
  user_query TEXT,
  parsed_license_query TEXT,
  candidate_licenses TEXT,
  ai_grouping_result TEXT,
  user_confirmed_license_names TEXT,
  created_at TEXT
);
```

### 19.9 audit_logs

```sql
CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  target_type TEXT,
  target_id TEXT,
  action TEXT,
  before_value TEXT,
  after_value TEXT,
  reason TEXT,
  created_at TEXT
);
```

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
- 必须识别类别、地区、人员、资料类型、学历、证书、多人员迹象。

### 20.2 查询解析 Prompt

要求：

- 将用户口语查询解析成结构化筛选条件。
- 不清楚的条件放入 ambiguities。
- 不直接返回最终人员结果。
- 查询结果必须由 SQL 根据确认条件产生。

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

## 22. MVP 验收标准

### 22.1 导入验收

- 能选择本地资料目录。
- 能递归扫描文件。
- 能识别新增文件和重复文件。
- 能生成导入批次记录。
- 能处理新增文件夹导入。

### 22.2 OCR / AI 验收

- 能对样本图片执行 OCR。
- 能将 OCR 文本送入 AI 抽取。
- 能生成结构化人员、类别、地区、证书信息。
- 低置信度进入待确认。

### 22.3 归档验收

- 能按 `类别 / 地区 / 人员 / 资料类型` 复制归档。
- 未识别地区进入未划分区域。
- 未识别人员进入待确认。
- 多人员资料进入 `_多人员资料`。
- 原始文件不被移动和删除。

### 22.4 修改删除验收

- 能修改人员类别、地区、资料类型。
- 修改后能标记 archive_dirty。
- 能预览归档变更。
- 能重新生成归档。
- 删除人员和文件为软删除。
- 能从回收站恢复。

### 22.5 查询导出验收

- 能自然语言查询。
- 能展示 AI 解析结果并让用户确认。
- 能进行证书候选确认。
- 能 SQL 查询人员。
- 能导出 Excel。
- 能复制人员资料到导出目录。

---

## 23. 开发优先级

### P0：样本验证版

目标：验证数据链路是否跑通。

范围：

1. electron-vite + React + TS 初始化。
2. 选择目录。
3. 扫描文件。
4. SQLite 入库。
5. 少量图片 OCR。
6. AI 结构化抽取。
7. 输出简单 Excel。
8. 验证类别、地区、人员、证书识别效果。

### P1：Electron MVP

目标：形成可用工具。

范围：

1. 导入批次。
2. 新增文件夹导入。
3. OCR / AI 任务队列。
4. 待确认页面。
5. 人员归并。
6. 标准归档生成。
7. 查询页。
8. 证书匹配。
9. Excel 和文件夹导出。
10. 软删除和回收站。
11. 重新归档。

### P2：完整产品版

目标：提高稳定性和可维护性。

范围：

1. 断点续跑。
2. 失败重试。
3. 更完整 PDF 处理。
4. 多人员 PDF 按页拆分。
5. 更完善证书别名库。
6. 更完整日志系统。
7. 安装包。
8. OCR 模型分发。
9. 自动更新。
10. 性能优化。

---

## 24. 风险与应对

### 24.1 脏数据风险

风险：

- 文件名无意义
- 文件夹混乱
- 图片模糊
- 同名人员
- 多人员资料
- 证书名称不统一

应对：

- 先样本验证。
- 低置信度待确认。
- 不移动原始文件。
- 保留操作日志。

### 24.2 OCR 准确率风险

风险：

- 模糊、歪斜、反光、遮挡、印章干扰。
- PDF 扫描件质量差。
- 多证件同图。

应对：

- OCR 失败进入待确认。
- 支持人工修正 OCR 文本。
- 重要资料人工复核。

### 24.3 证书判断风险

风险：

- AI 无法稳定判断证书是否业务认可。
- 同名相近证书容易误判。

应对：

- embedding 只做召回。
- AI 只做分组解释。
- 用户确认本次认可证书。
- SQL 精确查询。

### 24.4 文件操作风险

风险：

- 误删
- 误覆盖
- 归档目录混乱

应对：

- 原始文件只读。
- 默认软删除。
- 归档前展示变更预览。
- 支持重新生成归档。

---

## 25. 一句话结论

本工具是一个基于 Electron 的 Windows 本地人员资料治理工具。

第一版采用：

```text
electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API
```

核心设计是：

```text
原始文件不动
数据库做事实源
归档目录做生成结果
AI 做辅助理解
人工确认处理不确定性
SQL 负责最终查询
```

最终实现：

```text
类别 / 地区 / 人员 / 资料类型
```

的稳定归档结构，并支持新增文件夹、修改、删除、重新归档、条件查询和资料导出。
