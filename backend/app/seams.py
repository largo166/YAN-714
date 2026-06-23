"""三接缝接口定义（P1，仅定义不实现/不接线）。

纲要『留接缝』：本轮只定义接口，不做完整实现。把未来扩展点固化为契约，
让后续 server 化 / 重检索模型 / 多租户演进时不必改调用方。

- StorageBackend：文件存储后端。v1 默认走本机文件系统（LocalStorageBackend 待实现）；
  未来可收编 cloud.py / 对象存储，但本轮不实现。
- RetrievalEngine：检索引擎契约。v1 = retrieval.py 的 FTS5/BM25+LIKE（已实现，
  此处仅给出抽象类型，重模型/向量检索留接口，本轮不接 Chroma/BGE-M3）。
- get_current_principal：当前主体扩展点。**不是登录/认证系统**（纲要规则 5），
  桌面端单用户固定返回本地主体，仅为未来多租户/权限留位。
"""
from __future__ import annotations

import abc
from dataclasses import dataclass
from typing import List, Optional, Protocol, runtime_checkable


# ── StorageBackend（接缝，不实现）──
@runtime_checkable
class StorageBackend(Protocol):
    """文件存储后端契约。v1 应由本机文件系统实现；对象存储为 OFF（仅留接缝）。"""

    def save(self, rel_path: str, data: bytes) -> str:
        """写入并返回最终路径。实现须经 validate_path 校验目标。"""
        ...

    def read(self, rel_path: str) -> bytes:
        ...

    def delete(self, rel_path: str) -> bool:
        """删除应可逆（移动到隔离/回收，不硬删）。"""
        ...

    def exists(self, rel_path: str) -> bool:
        ...


# ── RetrievalEngine（接缝；v1 实现 = retrieval.py）──
@dataclass
class RetrievalResult:
    """检索结果契约（与 retrieval.SearchHit 对齐，便于 v1 适配）。"""

    document_id: int
    title: str
    snippet: str
    score: float
    engine: str  # "fts5" | "like" | 未来 "vector"


class RetrievalEngine(abc.ABC):
    """检索引擎抽象。v1 = FTS5/BM25+LIKE（retrieval.py）；重模型/向量留接缝（P6 可选下载，不打包）。"""

    @abc.abstractmethod
    def search(self, query: str, *, top_k: int = 5) -> List[RetrievalResult]:
        ...

    @abc.abstractmethod
    def reindex(self) -> int:
        """重建索引，返回索引文档数。"""
        ...


# ── get_current_principal（扩展点，非认证系统）──
@dataclass(frozen=True)
class Principal:
    """当前主体。桌面端单用户固定值；未来多租户/权限的占位。"""

    id: str = "local"
    name: str = "本机用户"
    is_admin: bool = True  # 桌面端本机即管理员；非鉴权结论


def get_current_principal() -> Principal:
    """返回当前主体。

    **这不是登录/认证系统**（纲要规则 5），仅为未来扩展预留的接缝。
    本轮恒返回本机主体。
    """
    return Principal()
