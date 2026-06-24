import { Component, type ErrorInfo, type ReactNode } from 'react'

/** 顶层错误边界:任一页面组件渲染抛错时,显示可读错误页 + 堆栈,而不是整页白屏。
 *  这样运行时异常能被定位(文件/行号),也不再因单组件崩溃白掉整个 app。 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留控制台完整堆栈,便于 F12 排查
    console.error('[ErrorBoundary] 渲染异常:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'monospace', color: '#b3261e', maxWidth: 900, margin: '40px auto' }}>
        <h2 style={{ margin: '0 0 12px' }}>页面渲染出错</h2>
        <div style={{ marginBottom: 12, color: '#444' }}>
          下面是错误详情(也可在 F12 控制台看完整堆栈)。修复后页面会自动刷新。
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: '#faf6f4', border: '1px solid #e3d9d4', borderRadius: 8, padding: 14, fontSize: 12.5, lineHeight: 1.6 }}>
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button onClick={() => location.reload()} style={{ marginTop: 12, padding: '6px 14px', cursor: 'pointer' }}>
          重新加载
        </button>
      </div>
    )
  }
}
