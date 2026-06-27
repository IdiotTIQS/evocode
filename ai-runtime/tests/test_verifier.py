import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.pkg.verifier import TsVerifier, filter_noise, NOISE_CODES
import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")

requires_node = pytest.mark.skipif(
    not (shutil.which("node") and (REPO_ROOT / "tools" / "ts-extractor" / "node_modules").is_dir()),
    reason="node/ts-extractor unavailable")


def test_filter_noise_removes_env_codes():
    diags = [
        {"file": "a", "line": 1, "code": 2503, "message": "Cannot find namespace 'React'."},
        {"file": "a", "line": 2, "code": 7026, "message": "JSX implicitly any"},
        {"file": "a", "line": 3, "code": 2322, "message": "Type 'string' not assignable to 'number'."},
    ]
    out = filter_noise(diags)
    assert len(out) == 1 and out[0]["code"] == 2322


@requires_node
def test_clean_fixture_passes():
    v = TsVerifier()
    assert v.is_available()
    res = v.check(FIXTURE)
    assert res["passed"] is True  # 过滤噪声后 0
    assert res["diagnosticCount"] == 0


@requires_node
def test_broken_file_fails():
    tmp = tempfile.mkdtemp()
    try:
        with open(os.path.join(tmp, "broken.tsx"), "w") as f:
            f.write("const x: number = \"string\";\nexport default function B(){return <div/>;}\n")
        res = TsVerifier().check(tmp)
        assert res["passed"] is False
        assert any(d["code"] == 2322 for d in res["diagnostics"])
    finally:
        shutil.rmtree(tmp)
