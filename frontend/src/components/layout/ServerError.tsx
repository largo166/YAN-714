interface Props {
  onRetry: () => void
}

/** 后端不可达全屏错误页（对应旧 #srv-err，文案去掉 exe 依赖，改中性）。 */
export default function ServerError({ onRetry }: Props) {
  return (
    <div id="srv-err" className="show">
      <div className="box">
        <h2>无法连接本地服务</h2>
        <p>
          ROM-AI 的本地后端没有响应。请确认后端 dev server 正在运行（
          <code>scripts/dev-backend</code>），然后重试。
        </p>
        <p className="sub">若你只是预览界面，可忽略此提示。</p>
        <button onClick={onRetry}>重试连接</button>
      </div>
    </div>
  )
}
