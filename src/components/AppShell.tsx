import { ChevronDown, CircleHelp, Database, Minus, Settings, Square, X } from 'lucide-react'
import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  return (
    <main className="workbench-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <span>Q</span>
          </div>
          <div>
            <h1>Qualidex</h1>
            <p>人员资料归档与资质查询工具</p>
          </div>
        </div>
        <nav className="topbar-actions" aria-label="应用操作">
          <button type="button">
            <Database size={18} />
            当前资料库
            <ChevronDown size={16} />
          </button>
          <button type="button">
            <Settings size={18} />
            设置
          </button>
          <button type="button">
            <CircleHelp size={18} />
            帮助
          </button>
          <span className="window-divider" />
          <button type="button" aria-label="最小化">
            <Minus size={18} />
          </button>
          <button type="button" aria-label="最大化">
            <Square size={16} />
          </button>
          <button type="button" aria-label="关闭">
            <X size={18} />
          </button>
        </nav>
      </header>
      {children}
    </main>
  )
}
