$ErrorActionPreference = "Stop"

# 无账号 Quick Tunnel：仅作公网验收。固定域名生产环境请改为 named tunnel token 服务。
npx --yes wrangler@latest tunnel quick-start http://127.0.0.1:8010
if ($LASTEXITCODE -ne 0) { throw "Wrangler tunnel exited: $LASTEXITCODE" }
