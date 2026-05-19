import { recentActivities, navItems, type WorkspaceMode } from '../mock/qualidexMock'

interface SidebarProps {
  mode: WorkspaceMode
  onModeChange(mode: WorkspaceMode): void
}

export function Sidebar({ mode, onModeChange }: SidebarProps) {
  return (
    <aside className="sidebar">
      <section className="sidebar-card">
        <h2>工作区</h2>
        <nav aria-label="工作区导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={mode === item.id ? 'active' : ''}
                onClick={() => onModeChange(item.id)}
              >
                <Icon size={22} />
                {item.label}
              </button>
            )
          })}
        </nav>
      </section>
      <section className="sidebar-card recent-card">
        <h2>最近操作</h2>
        {recentActivities.map((activity) => (
          <p key={activity}>{activity}</p>
        ))}
      </section>
    </aside>
  )
}
