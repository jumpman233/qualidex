import { spawn } from 'node:child_process'
import path from 'node:path'

const OCR_TIMEOUT_MS = 120_000

export interface OcrResult {
  text: string
  lineCount: number
  confidence: number | null
}

interface OcrProcessPayload {
  ok: boolean
  text?: string
  lineCount?: number
  confidence?: number | null
  error?: string
}

export async function extractImageText(imagePath: string): Promise<OcrResult> {
  const workspaceRoot = resolveWorkspaceRoot()
  const scriptPath = path.join(workspaceRoot, 'scripts', 'ocr', 'paddle_ocr.py')
  const pythonExecutable = process.env.QUALIDEX_PYTHON ?? 'python'

  const payload = await runPythonOcr(pythonExecutable, scriptPath, workspaceRoot, imagePath)

  if (!payload.ok) {
    throw new Error(payload.error ?? 'OCR failed')
  }

  return {
    text: payload.text ?? '',
    lineCount: payload.lineCount ?? 0,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : null,
  }
}

function runPythonOcr(
  pythonExecutable: string,
  scriptPath: string,
  workspaceRoot: string,
  imagePath: string,
): Promise<OcrProcessPayload> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath, workspaceRoot, imagePath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
      },
      windowsHide: true,
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timeout = setTimeout(() => {
      settled = true
      child.kill()
      reject(new Error(`OCR timed out after ${OCR_TIMEOUT_MS / 1000}s`))
    }, OCR_TIMEOUT_MS)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)

      try {
        const payload = JSON.parse(stdout.trim()) as OcrProcessPayload
        if (code !== 0 && payload.ok) {
          reject(new Error(`OCR process failed with exit code ${code ?? 'unknown'}`))
          return
        }
        resolve(payload)
      } catch {
        reject(new Error(formatOcrOutputError(code, stdout, stderr)))
      }
    })
  })
}

function resolveWorkspaceRoot(): string {
  if (process.env.APP_ROOT) {
    return process.env.APP_ROOT
  }

  return process.cwd()
}

function formatOcrOutputError(code: number | null, stdout: string, stderr: string): string {
  const details = stderr.trim() || stdout.trim()
  const suffix = details ? `: ${details.slice(0, 500)}` : ''
  return `OCR process returned invalid output with exit code ${code ?? 'unknown'}${suffix}`
}
