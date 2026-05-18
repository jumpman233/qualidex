import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface AiModelConfig {
  provider: string
  baseUrl: string
  modelName: string
  apiKey: string
  sampleAcceptanceRate: number
  useJsonResponseFormat: boolean
}

const DEFAULT_SAMPLE_ACCEPTANCE_RATE = 0.2

export function loadAiModelConfig(workspaceRoot = process.env.APP_ROOT ?? process.cwd()): AiModelConfig | null {
  const localEnv = readLocalEnv(path.join(workspaceRoot, '.env.local'))
  const env = {
    ...localEnv,
    ...process.env,
  }

  const provider = env.AI_PROVIDER?.trim()
  const baseUrl = env.AI_BASE_URL?.trim()
  const modelName = env.AI_MODEL_NAME?.trim()
  const apiKey = env.AI_API_KEY?.trim()

  if (!provider || !baseUrl || !modelName || !apiKey) {
    return null
  }

  return {
    provider,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    modelName,
    apiKey,
    sampleAcceptanceRate: parseSampleRate(env.AI_SAMPLE_ACCEPTANCE_RATE),
    useJsonResponseFormat: parseBoolean(env.AI_USE_JSON_RESPONSE_FORMAT),
  }
}

function readLocalEnv(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    return {}
  }

  const content = readFileSync(envPath, 'utf8')
  const values: Record<string, string> = {}

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim()

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmedLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmedLine.slice(0, separatorIndex).trim()
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim()
    values[key] = stripQuotes(rawValue)
  }

  return values
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseSampleRate(value: string | undefined): number {
  if (!value) {
    return DEFAULT_SAMPLE_ACCEPTANCE_RATE
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SAMPLE_ACCEPTANCE_RATE
  }

  return Math.min(Math.max(parsed, 0), 1)
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}
