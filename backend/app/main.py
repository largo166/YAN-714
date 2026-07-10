"""FastAPI 应用入口。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .access_control import AccessControlMiddleware, router as access_router
from .config import settings, frontend_dist_dir
from .database import init_db
from .routers import agents, boss, broadcast, chat, health, knowledge, projects
from .routers import project_files, project_analysis
from .routers import cognition
from .routers import cross_project
from .routers import reflow
from .routers import meetings
from .routers import result_send
from .routers import settings as settings_router
from .routers import team
from .routers import clients
from .routers import inbox
from .routers import workspace
from .routers import skills
from .routers import filesystem
from .routers import review_checklist
from .routers import admin
from .routers import staging
from .routers import ingest
from .routers import app_meta


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ROM-AI Backend", version="0.2.0", lifespan=lifespan)

app.add_middleware(AccessControlMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(access_router)
app.include_router(projects.router)
app.include_router(settings_router.router)
app.include_router(chat.router)
app.include_router(knowledge.router)
app.include_router(workspace.router)
app.include_router(filesystem.router)
app.include_router(project_files.router)
app.include_router(project_files.assets_router)
app.include_router(project_analysis.router)
app.include_router(cognition.router)
app.include_router(cross_project.router)
app.include_router(reflow.router)
app.include_router(meetings.router)
app.include_router(skills.router)
app.include_router(review_checklist.router)
app.include_router(team.router)
app.include_router(clients.router)
app.include_router(inbox.router)
app.include_router(agents.router)
app.include_router(broadcast.router)
app.include_router(boss.router)
app.include_router(result_send.router)
app.include_router(admin.router)
app.include_router(staging.router)
app.include_router(ingest.router)
app.include_router(app_meta.router)


# ── 前端托管：构建产物存在时(exe / 生产)同源托管 dist，免第二个端口/CORS ──
_DIST = frontend_dist_dir()
_INDEX = _DIST / "index.html"

if _INDEX.exists():
    if (_DIST / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/")
    def _spa_index() -> FileResponse:
        return FileResponse(str(_INDEX))

    @app.get("/{full_path:path}")
    def _spa(full_path: str) -> FileResponse:
        # API/文档已在上面注册并优先匹配；这里只兜前端静态文件 + SPA 回退。
        if full_path.startswith(("api/", "api", "docs", "redoc", "openapi", "health")):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = _DIST / full_path
        if candidate.is_file():
            return FileResponse(str(candidate))
        return FileResponse(str(_INDEX))  # SPA 回退到 index.html
else:
    @app.get("/")
    def root() -> dict:
        return {"app": "ROM-AI", "docs": "/docs", "health": "/health"}
