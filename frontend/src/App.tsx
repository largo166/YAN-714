import { useEffect, useState } from 'react'

import SettingsDrawer from '@/components/layout/SettingsDrawer'
import ServerError from '@/components/layout/ServerError'
import TopBar from '@/components/layout/TopBar'
import CampPage from '@/pages/CampPage'
import BossPage from '@/pages/BossPage'
import HubPage from '@/pages/HubPage'
import KnowledgePage from '@/pages/KnowledgePage'
import ProjectCenterPage from '@/pages/ProjectCenterPage'
import { api } from '@/lib/api'
import { ProjectProvider } from '@/contexts/ProjectContext'
import type { BoardKey } from '@/types/boards'

// 已暗色化的板块（整 app 暗·逐页推进）。改造完一页就把它的 key 加进来。
const DARK_BOARDS = new Set<BoardKey>(['agent', 'boss'])

export default function App() {
  const [board, setBoard] = useState<BoardKey>('proj')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [serverDown, setServerDown] = useState(false)

  // 暗页时给 <body> 挂 darkui，让背景与顶栏一起转暗（含顶栏）
  useEffect(() => {
    document.body.classList.toggle('darkui', DARK_BOARDS.has(board))
    return () => document.body.classList.remove('darkui')
  }, [board])

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
    <ProjectProvider>
      <TopBar
        board={board}
        onBoard={setBoard}
        online={!serverDown}
        onOpenSettings={() => setSettingsOpen(true)}
        adminVisible
      />
      <div className="wrap">
        <div className={'page' + (board === 'proj' ? ' on' : '')}>
          {board === 'proj' && <ProjectCenterPage />}
        </div>
        <div className={'page' + (board === 'know' ? ' on' : '')}>
          {board === 'know' && <KnowledgePage />}
        </div>
        <div className={'page' + (board === 'agent' ? ' on' : '')}>
          {board === 'agent' && <CampPage />}
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
    </ProjectProvider>
  )
}
