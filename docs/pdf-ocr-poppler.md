# PDF 扫描件 OCR 方案

Qualidex 的 PDF 处理分两层：

1. 先用 `pdfjs-dist` 尝试提取 PDF 文本层。
2. 如果文本层为空，或 `pdfjs-dist` 在 Node / Electron 环境中遇到 worker、canvas 等问题，则使用 Poppler 将 PDF 页面转成 PNG，再复用本地图片 OCR。

## 开发期配置

项目已安装 `pdf-poppler`，开发期会优先自动使用其内置 Windows Poppler：

```text
node_modules/pdf-poppler/lib/win/poppler-0.51/bin/pdftoppm.exe
```

如果需要改用本机安装的 Poppler，可在 `.env.local` 中覆盖：

```env
POPPLER_BIN_DIR="D:\\tools\\poppler\\Library\\bin"
PDF_OCR_DPI=300
PDF_OCR_MAX_PAGES=20
```

要求 `POPPLER_BIN_DIR` 目录下存在：

```text
pdftoppm.exe
```

如果既没有内置 Poppler，也没有配置 `POPPLER_BIN_DIR`，扫描型 PDF 会返回清晰错误，不再依赖 `@napi-rs/canvas`。

## 临时文件

PDF 页面图片生成到系统临时目录：

```text
qualidex-pdf-ocr-*
```

默认任务结束后自动清理。如果需要排查转图效果，可设置：

```env
KEEP_PDF_OCR_TEMP=1
```

## 验证

```powershell
pnpm run verify:text-extract
```

该脚本覆盖：

- `.txt` 文本提取
- 图片 OCR
- PDF 文本层提取
- 扫描型 PDF fallback 检测

如果未配置 Poppler，扫描型 PDF fallback 会跳过并输出 Poppler 配置提示。
