# AI 结构化抽取设计

## 目标

本阶段实现 OCR 文本到结构化字段的最小闭环：

- 只上传 OCR 文本和文件元信息，不上传原始图片、PDF 或资料包。
- AI 结果只作为建议，不直接写入最终人员事实表。
- 低置信度、未知字段、冲突、多人员资料进入待确认。
- 模型与供应商通过配置切换，不绑定单一模型。

## 配置

运行时从环境变量或仓库根目录 `.env.local` 读取配置：

```text
AI_PROVIDER="volcengine"
AI_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
AI_MODEL_NAME="doubao-seed-2-0-lite-260428"
AI_API_KEY="..."
AI_SAMPLE_ACCEPTANCE_RATE="0.2"
AI_USE_JSON_RESPONSE_FORMAT="false"
```

`.env.local` 不进入 Git。仓库只保留 `.env.example` 作为模板。

## Provider 设计

当前实现使用 OpenAI-compatible chat completions 协议：

```text
POST {AI_BASE_URL}/chat/completions
Authorization: Bearer {AI_API_KEY}
model: {AI_MODEL_NAME}
```

这样可以先接豆包 Lite，也可以后续切换到其他兼容 chat completions 的模型。供应商差异主要收敛在：

- `AI_PROVIDER`
- `AI_BASE_URL`
- `AI_MODEL_NAME`
- `AI_API_KEY`
- 响应格式兼容程度

豆包 Lite 当前不支持 `response_format: { "type": "json_object" }`，因此默认通过 Prompt 约束 JSON 输出，并由本地解析与校验兜底。若后续切换到支持 JSON response format 的模型，可以设置：

```text
AI_USE_JSON_RESPONSE_FORMAT="true"
```

## 数据落点

AI 抽取结果写入 `ai_extract_results`，包含：

- provider
- model_name
- status
- confidence
- needs_manual_review
- review_reasons
- result_json
- error

需要人工确认的原因写入 `review_items`。本阶段不直接创建或修改 `people`、`licenses` 等最终事实数据。

## 抽样验收

`pnpm run verify:ai-extract` 用一段固定 OCR 文本调用当前配置模型，并校验：

- 返回内容是合法 JSON。
- 能抽取人员姓名。
- 身份证号只保留后四位。
- `confidence` 位于 0 到 1。
- `evidence` 是数组。

没有配置模型时，该脚本会跳过真实调用，避免 CI 或无密钥环境失败。
