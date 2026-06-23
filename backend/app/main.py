"""FastAPI 应用入口。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import chat, health, knowledge, projects
from .routers import project_files, project_analysis
from .routers import meetings
from .routers import settings as settings_router
from .routers import workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ROM-AI Backend", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(projects.router)
app.include_router(settings_router.router)
app.include_router(chat.router)
app.include_router(knowledge.router)
app.include_router(workspace.router)
app.include_router(project_files.router)
app.include_router(project_analysis.router)
app.include_router(meetings.router)


@app.get("/")
def root() -> dict:
    return {"app": "ROM-AI", "docs": "/docs", "health": "/health"}
