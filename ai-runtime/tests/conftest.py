import os
import tempfile
import shutil
import pytest


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
