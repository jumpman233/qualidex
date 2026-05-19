import { Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { quickActions, type WorkspaceMode } from '../mock/qualidexMock'

interface CommandBarProps {
  onModeChange(mode: WorkspaceMode): void
}

export function CommandBar({ onModeChange }: CommandBarProps) {
  const [query, setQuery] = useState('找成都 3 个大专以上、有二建证、资料齐全的人')

  function handleStart() {
    if (query.trim()) {
      onModeChange('search')
    }
  }

  return (
    <section className="command-card" aria-label="智能操作区">
      <div className="command-title">
        <Sparkles size={28} />
        <h2>您想找什么人员，或者要整理哪批资料？</h2>
      </div>
      <div className="command-input">
        <Search size={24} />
        <input
          aria-label="输入查询或操作"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="找成都 3 个大专以上、有二建证、资料齐全的人"
        />
        <button type="button" onClick={handleStart}>开始</button>
      </div>
      <div className="quick-actions">
        {quickActions.map((action) => {
          const Icon = action.icon
          return (
            <button key={action.id} type="button" onClick={() => onModeChange(action.id)}>
              <span className={`quick-icon ${action.id}`}>
                <Icon size={24} />
              </span>
              {action.label}
            </button>
          )
        })}
      </div>
    </section>
  )
}
