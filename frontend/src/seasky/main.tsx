import React from 'react'
import ReactDOM from 'react-dom/client'

import './lib/gsapSetup' /* 必须最先:注册 premium/premiumOut ease */
import './styles/globals.css'
import { AppShell } from './components/shell/AppShell'
import { AccessGate } from './components/system/AccessGate'

ReactDOM.createRoot(document.getElementById('seasky-root')!).render(
  <React.StrictMode>
    <AccessGate>
      <AppShell />
    </AccessGate>
  </React.StrictMode>,
)
