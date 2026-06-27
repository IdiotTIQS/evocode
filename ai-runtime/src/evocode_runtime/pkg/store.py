import os
import json
import hashlib
import sqlite3
from abc import ABC, abstractmethod


def compute_fingerprint(repo_path: str) -> str:
    """SHA-256 of sorted (rel_path, mtime_ns, size) for all .ts/.tsx files,
    excluding node_modules. Stable across calls; changes on any file edit/add/delete."""
    entries = []
    for dirpath, dirnames, filenames in os.walk(repo_path):
        dirnames[:] = [d for d in dirnames if d != "node_modules"]
        for fname in filenames:
            if fname.endswith((".ts", ".tsx")):
                abs_path = os.path.join(dirpath, fname)
                rel_path = os.path.relpath(abs_path, repo_path)
                st = os.stat(abs_path)
                entries.append((rel_path, st.st_mtime_ns, st.st_size))
    entries.sort()
    payload = json.dumps(entries, separators=(",", ":")).encode()
    return hashlib.sha256(payload).hexdigest()


_SCHEMA = """
CREATE TABLE IF NOT EXISTS graph_version (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        TEXT NOT NULL,
    repo_path         TEXT NOT NULL,
    repo_fingerprint  TEXT NOT NULL,
    created_at        TEXT NOT NULL DEFAULT (datetime('now','utc')),
    status            TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_gv_project_repo ON graph_version(project_id, repo_path);
CREATE TABLE IF NOT EXISTS node (
    version_id  INTEGER NOT NULL,
    node_id     TEXT    NOT NULL,
    type        TEXT    NOT NULL,
    data        TEXT    NOT NULL,
    PRIMARY KEY (version_id, node_id),
    FOREIGN KEY (version_id) REFERENCES graph_version(id)
);
CREATE TABLE IF NOT EXISTS edge (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    version_id  INTEGER NOT NULL,
    edge_type   TEXT    NOT NULL,
    from_id     TEXT    NOT NULL,
    to_id       TEXT    NOT NULL,
    data        TEXT,
    FOREIGN KEY (version_id) REFERENCES graph_version(id)
);
CREATE INDEX IF NOT EXISTS idx_edge_version ON edge(version_id);
"""


class GraphStore(ABC):
    @abstractmethod
    def find_active_version(self, project_id: str, repo_path: str, fingerprint: str) -> int | None: ...
    @abstractmethod
    def load_graph(self, version_id: int) -> dict: ...
    @abstractmethod
    def store_version(self, project_id: str, repo_path: str, fingerprint: str, graph: dict) -> int: ...


class SqliteGraphStore(GraphStore):
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        conn = self._connect()
        try:
            conn.executescript(_SCHEMA)
            conn.commit()
        finally:
            conn.close()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        return conn

    def find_active_version(self, project_id: str, repo_path: str, fingerprint: str) -> int | None:
        conn = self._connect()
        try:
            cur = conn.execute(
                """SELECT id FROM graph_version
                   WHERE project_id=? AND repo_path=? AND repo_fingerprint=? AND status='active'
                   ORDER BY id DESC LIMIT 1""",
                (project_id, repo_path, fingerprint))
            row = cur.fetchone()
            return row[0] if row else None
        finally:
            conn.close()

    def load_graph(self, version_id: int) -> dict:
        conn = self._connect()
        try:
            nodes = []
            for nid, ntype, djson in conn.execute(
                    "SELECT node_id, type, data FROM node WHERE version_id=?", (version_id,)):
                n = {"id": nid, "type": ntype}
                n.update(json.loads(djson))
                nodes.append(n)
            edges = []
            for etype, fid, tid, djson in conn.execute(
                    "SELECT edge_type, from_id, to_id, data FROM edge WHERE version_id=?", (version_id,)):
                e = {"type": etype, "from": fid, "to": tid}
                if djson:
                    e.update(json.loads(djson))
                edges.append(e)
            return {"nodes": nodes, "edges": edges}
        finally:
            conn.close()

    def store_version(self, project_id: str, repo_path: str, fingerprint: str, graph: dict) -> int:
        conn = self._connect()
        try:
            cur = conn.execute(
                "INSERT INTO graph_version(project_id, repo_path, repo_fingerprint, status) VALUES (?,?,?,'active')",
                (project_id, repo_path, fingerprint))
            vid = cur.lastrowid
            for node in graph.get("nodes", []):
                extra = {k: v for k, v in node.items() if k not in ("id", "type")}
                conn.execute(
                    "INSERT INTO node(version_id, node_id, type, data) VALUES (?,?,?,?)",
                    (vid, node["id"], node["type"], json.dumps(extra)))
            for edge in graph.get("edges", []):
                extra = {k: v for k, v in edge.items() if k not in ("type", "from", "to")}
                conn.execute(
                    "INSERT INTO edge(version_id, edge_type, from_id, to_id, data) VALUES (?,?,?,?,?)",
                    (vid, edge["type"], edge["from"], edge["to"], json.dumps(extra) if extra else None))
            conn.execute(
                """UPDATE graph_version SET status='superseded'
                   WHERE project_id=? AND repo_path=? AND id != ? AND status='active'""",
                (project_id, repo_path, vid))
            conn.commit()
            return vid
        finally:
            conn.close()
