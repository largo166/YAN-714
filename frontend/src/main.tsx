import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/legacy-ui.css'
// Tailwind 基座在 legacy 之后导入:混用元素上工具类按层叠赢过 legacy 同权重规则(P2 逐页迁移的前提)
import './styles/tailwind.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
