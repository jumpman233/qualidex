import { useState } from 'react'
import { AppShell } from './components/AppShell'
import { CommandBar } from './components/CommandBar'
import { MainWorkspace } from './components/MainWorkspace'
import { OverviewCards } from './components/OverviewCards'
import { Sidebar } from './components/Sidebar'
import { type WorkspaceMode } from './mock/qualidexMock'
import './App.css'

function App() {
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('home')

  return (
    <AppShell>
      <div className="workbench-content">
        <CommandBar onModeChange={setWorkspaceMode} />
        <OverviewCards />
        <div className="workspace-layout">
          <Sidebar mode={workspaceMode} onModeChange={setWorkspaceMode} />
          <MainWorkspace mode={workspaceMode} onModeChange={setWorkspaceMode} />
        </div>
      </div>
    </AppShell>
  )
}

export default App
