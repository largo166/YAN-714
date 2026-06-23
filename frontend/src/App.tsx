import { useEffect, useState } from 'react'

import SettingsDrawer from '@/components/layout/SettingsDrawer'
import ServerError from '@/components/layout/ServerError'
import TopBar from '@/components/layout/TopBar'
import AgentPage from '@/pages/AgentPage'
import BossPage from '@/pages/BossPage'
import HubPage from '@/pages/HubPage'
import KnowledgePage from '@/pages/KnowledgePage'
import ProjectCenterPage from '@/pages/ProjectCenterPage'
import { api } from '@/lib/api'
import type { BoardKey } from '@/types/boards'

export default function App() {
  const [board, setBoard] = useState<BoardKey>('proj')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverDown, setServerDown] = useState(false)

  // 顶栏「本地运行」状态 + 后端不可达检测（对应旧 /api/health 轮询）
  useEffect(() => {
    let alive = true
    api
      .health()
      .then(() => alive && setServerDown(false))
      .catch(() => alive && setServerDown(true))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <TopBar
        board={board}
        onBoard={setBoard}
        online={!serverDown}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="wrap">
        <div className={'page' + (board === 'proj' ? ' on' : '')}>
          {board === 'proj' && <ProjectCenterPage />}
        </div>
        <div className={'page' + (board === 'know' ? ' on' : '')}>
          {board === 'know' && <KnowledgePage />}
        </div>
        <div className={'page' + (board === 'agent' ? ' on' : '')}>
          {board === 'agent' && <AgentPage />}
        </div>
        <div className={'page' + (board === 'hub' ? ' on' : '')}>
          {board === 'hub' && <HubPage />}
        </div>
        <div className={'page' + (board === 'boss' ? ' on' : '')}>
          {board === 'boss' && <BossPage />}
        </div>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {serverDown && <ServerError onRetry={() => location.reload()} />}
    </>
  )
}
