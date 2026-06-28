import os
import tempfile
import shutil
import pytest

# 在任何测试模块 import run_service/main（它们在模块级 build_graph()）之前，
# 把 checkpoint DB 指向临时文件，避免污染 ai-runtime/data/checkpoints.db。
# 必须在 import 时设置，因为图是模块级单例、构建早于 fixture。
_CKPT_TMP = tempfile.mkdtemp(prefix="evocode_ckpt_")
os.environ.setdefault("EVOCODE_CHECKPOINT_DB", os.path.join(_CKPT_TMP, "checkpoints.db"))


@pytest.fixture(autouse=True, scope="session")
def _isolate_pkg_db(tmp_path_factory):
    """Redirect EVOCODE_PKG_DB to a temp dir for the entire test session.

    This prevents any test that exercises understand_node or RunService from
    writing to ai-runtime/data/pkg.db.  Individual tests that need their own
    fresh DB (e.g. test_understand_cache) override EVOCODE_PKG_DB via
    monkeypatch, which takes precedence over the session-level os.environ set
    here because monkeypatch restores after each test.
    """
    tmp = tmp_path_factory.mktemp("session_db")
    db_path = str(tmp / "data" / "pkg.db")
    os.makedirs(str(tmp / "data"), exist_ok=True)
    old = os.environ.get("EVOCODE_PKG_DB")
    os.environ["EVOCODE_PKG_DB"] = db_path
    yield
    if old is None:
        os.environ.pop("EVOCODE_PKG_DB", None)
    else:
        os.environ["EVOCODE_PKG_DB"] = old
