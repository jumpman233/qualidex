import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(null)
  const [scanResult, setScanResult] = useState<DirectoryScanResult | null>(null)
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'done' | 'error'>('idle')
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    window.qualidex.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo({
        name: 'Qualidex',
        version: 'unknown',
        platform: 'win32',
      })
    })
  }, [])

  async function handleSelectDirectory() {
    const directoryPath = await window.qualidex.selectSourceDirectory()

    if (!directoryPath) {
      return
    }

    setSelectedDirectory(directoryPath)
    setScanResult(null)
    setScanError(null)
    setScanStatus('scanning')

    try {
      const result = await window.qualidex.scanDirectory(directoryPath)
      setScanResult(result)
      setScanStatus('done')
    } catch (error) {
      setScanError(error instanceof Error ? error.message : String(error))
      setScanStatus('error')
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">P0 Desktop Shell</p>
          <h1>Qualidex</h1>
          <p className="summary">人员资料归档与资质查询工具</p>
        </div>
        <dl className="runtime">
          <div>
            <dt>应用</dt>
            <dd>{appInfo?.name ?? '读取中'}</dd>
          </div>
          <div>
            <dt>版本</dt>
            <dd>{appInfo?.version ?? '读取中'}</dd>
          </div>
          <div>
            <dt>平台</dt>
            <dd>{appInfo?.platform ?? '读取中'}</dd>
          </div>
        </dl>
      </section>

      <section className="status-grid" aria-label="P0 status">
        <article>
          <span>01</span>
          <h2>Electron</h2>
          <p>Main Process 已启动，窗口由 Electron 创建。</p>
        </article>
        <article>
          <span>02</span>
          <h2>React</h2>
          <p>Renderer 使用 React 和 TypeScript 渲染。</p>
        </article>
        <article>
          <span>03</span>
          <h2>IPC</h2>
          <p>Renderer 通过 preload 获取应用信息。</p>
        </article>
      </section>

      <section className="scanner-panel" aria-label="directory scanner">
        <div className="scanner-heading">
          <div>
            <p className="eyebrow">Local Source</p>
            <h2>资料目录扫描</h2>
          </div>
          <button type="button" onClick={handleSelectDirectory} disabled={scanStatus === 'scanning'}>
            {scanStatus === 'scanning' ? '扫描中' : '选择资料目录'}
          </button>
        </div>

        <div className="selected-path">
          <span>当前目录</span>
          <strong>{selectedDirectory ?? '尚未选择'}</strong>
        </div>

        {scanError && <p className="error-message">{scanError}</p>}

        {scanResult && (
          <>
            <dl className="scan-metrics">
              <div>
                <dt>文件总数</dt>
                <dd>{scanResult.totalFiles}</dd>
              </div>
              <div>
                <dt>支持类型</dt>
                <dd>{scanResult.supportedFiles}</dd>
              </div>
              <div>
                <dt>其他类型</dt>
                <dd>{scanResult.unsupportedFiles}</dd>
              </div>
              <div>
                <dt>总大小</dt>
                <dd>{formatBytes(scanResult.totalBytes)}</dd>
              </div>
              <div>
                <dt>读取错误</dt>
                <dd>{scanResult.errors.length}</dd>
              </div>
              <div>
                <dt>跳过目录</dt>
                <dd>{scanResult.skippedDirectories.length}</dd>
              </div>
            </dl>

            <div className="scan-table-wrap">
              <table className="scan-table">
                <thead>
                  <tr>
                    <th>文件</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.files.map((file) => (
                    <tr key={file.path}>
                      <td title={file.path}>{file.relativePath}</td>
                      <td>{file.ext || '无扩展名'}</td>
                      <td>{formatBytes(file.sizeBytes)}</td>
                      <td>{file.isSupported ? '可处理' : '暂不支持'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {scanResult.errors.length > 0 && (
              <div className="scan-errors">
                <h3>读取失败</h3>
                {scanResult.errors.map((item) => (
                  <p key={item.path}>
                    <strong>{item.path}</strong>
                    <span>{item.message}</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

export default App
