import os, shutil, tempfile
from pathlib import Path
from evocode_runtime.pkg.store import compute_fingerprint

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURE = str(REPO_ROOT / "test" / "fixtures" / "next-app")


def test_fingerprint_stable():
    assert compute_fingerprint(FIXTURE) == compute_fingerprint(FIXTURE)


def test_fingerprint_changes_on_edit():
    tmp = tempfile.mkdtemp()
    try:
        dst = os.path.join(tmp, "app.tsx")
        with open(dst, "w") as f:
            f.write("export default function A(){return <div/>;}")
        fp1 = compute_fingerprint(tmp)
        # 改内容并确保 mtime 变化
        import time; time.sleep(0.01)
        with open(dst, "w") as f:
            f.write("export default function A(){return <span/>;}\n// changed")
        fp2 = compute_fingerprint(tmp)
        assert fp1 != fp2
    finally:
        shutil.rmtree(tmp)


def test_fingerprint_excludes_node_modules():
    tmp = tempfile.mkdtemp()
    try:
        with open(os.path.join(tmp, "app.tsx"), "w") as f:
            f.write("export default function A(){return <div/>;}")
        fp_before = compute_fingerprint(tmp)
        nm = os.path.join(tmp, "node_modules"); os.makedirs(nm)
        with open(os.path.join(nm, "junk.ts"), "w") as f:
            f.write("export const x=1;")
        assert compute_fingerprint(tmp) == fp_before  # node_modules 不影响
    finally:
        shutil.rmtree(tmp)
