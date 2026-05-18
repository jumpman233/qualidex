import { useEffect, useState } from 'react'
import './App.css'

function App() {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.qualidex.getAppInfo().then(setAppInfo).catch(() => {
      setAppInfo({
        name: 'Qualidex',
        version: 'unknown',
        platform: 'win32',
      })
    })
  }, [])

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
    </main>
  )
}

export default App
