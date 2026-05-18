# Qualidex PRD 拆分文档

> 来源：Qualidex PRD V1.2  
> 产品形态：Windows 本地桌面工具  
> 技术栈：Electron + electron-vite + React + TypeScript + SQLite + sqlite-vec + 本地 OCR + 云端文本 AI API

## 7. 核心业务流程

### 7.1 首次全量导入流程

```text
用户选择原始资料目录
  ↓
用户选择归档输出目录
  ↓
可选：用户指定默认主类别 / 默认地区
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
可选：指定主类别 / 地区
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
