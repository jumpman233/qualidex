import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const workspaceRoot = process.cwd()
const folderPath = process.argv[2]

if (!folderPath) {
  console.error('用法：pnpm run extract:person-folder -- "D:\\人员资料\\张三"')
  process.exit(1)
}

const tempBase = path.join(workspaceRoot, '.tmp')
await mkdir(tempBase, { recursive: true })
const tempRoot = await mkdtemp(path.join(tempBase, 'qualidex-person-folder-'))
const tempModuleRoot = path.join(tempRoot, 'modules')

const modules = [
  ['electron/services/idCardService.ts', 'electron/services/idCardService.js'],
  ['electron/services/aiConfig.ts', 'electron/services/aiConfig.js'],
  ['electron/services/fileScanner.ts', 'electron/services/fileScanner.js'],
  ['electron/services/ocrService.ts', 'electron/services/ocrService.js'],
  ['electron/services/pdfRasterService.ts', 'electron/services/pdfRasterService.js'],
  ['electron/services/textExtractService.ts', 'electron/services/textExtractService.js'],
  ['electron/services/personFolderExtractService.ts', 'electron/services/personFolderExtractService.js'],
]

try {
  await buildModules()
  const { extractPersonFolder } = await import(pathToFileURL(path.join(
    tempModuleRoot,
    'electron/services/personFolderExtractService.js',
  )))
  const result = await extractPersonFolder(folderPath)
  console.log(JSON.stringify(toChineseOutput(result), null, 2))
} finally {
  await rm(tempRoot, { recursive: true, force: true })
}

async function buildModules() {
  await mkdir(tempModuleRoot, { recursive: true })
  await writeFile(path.join(tempModuleRoot, 'package.json'), '{"type":"commonjs"}\n', 'utf8')

  for (const [sourcePath, outputPath] of modules) {
    const source = await readFile(path.join(workspaceRoot, sourcePath), 'utf8')
    const output = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        strict: true,
      },
    })
    const targetPath = path.join(tempModuleRoot, outputPath)
    await mkdir(path.dirname(targetPath), { recursive: true })
    await writeFile(targetPath, output.outputText, 'utf8')
  }
}

function toChineseOutput(result) {
  return {
    文件夹: result.folderPath,
    人员: result.people.map((person, index) => ({
      序号: index + 1,
      姓名: person.personName,
      身份证号: person.idCardNumber,
      身份证号脱敏展示: person.idCardMaskedDisplay,
      学历: person.education,
      证书: person.certificates.map((certificate) => ({
        证书名称: certificate.certificateName,
        证书专业: certificate.certificateSpecialty,
        显示名称: certificate.displayName,
        置信度: certificate.confidence,
        依据: certificate.evidence,
      })),
      置信度: person.confidence,
      需要人工确认: person.needsReview,
      待确认原因: person.reviewReasons,
      相关文件: person.files.map((file) => ({
        文件名: file.fileName,
        相对路径: file.relativePath,
        关系类型: file.relationType,
        关系置信度: file.relationConfidence,
        依据: file.evidence,
      })),
    })),
    未归属文件: result.unresolvedFiles.map((file) => ({
      文件名: file.fileName,
      相对路径: file.relativePath,
      提取状态: file.extractionStatus,
      错误: file.error,
    })),
    整体需要人工确认: result.needsReview,
    整体待确认原因: result.reviewReasons,
    AI状态: result.ai,
    全部文件: result.files.map((file) => ({
      文件名: file.fileName,
      相对路径: file.relativePath,
      原始路径: file.originalPath,
      提取状态: file.extractionStatus,
      OCR置信度: file.confidence,
      错误: file.error,
      文本预览: file.textPreview,
    })),
  }
}
