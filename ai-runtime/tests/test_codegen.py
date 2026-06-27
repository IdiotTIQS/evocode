from evocode_runtime.codegen import generate_change_set, apply_change_set
import os
import tempfile
import shutil


def test_frontend_task_generates_tsx():
    tasks = [{"id": "task-1", "title": "Build contact page", "kind": "frontend",
              "description": "a contact form"}]
    files = generate_change_set(tasks, "add a contact page")
    assert len(files) == 1
    assert files[0]["path"].endswith(".tsx")
    assert "export default" in files[0]["content"]
    assert "evocode_generated/" in files[0]["path"]


def test_backend_task_generates_java():
    tasks = [{"id": "task-1", "title": "Comments API", "kind": "backend",
              "description": "comment endpoints"}]
    files = generate_change_set(tasks, "add comments api")
    assert files[0]["path"].endswith(".java")
    assert "@RestController" in files[0]["content"]


def test_apply_writes_only_under_generated_dir():
    tasks = [{"id": "task-1", "title": "X", "kind": "frontend", "description": "d"}]
    files = generate_change_set(tasks, "intent")
    tmp = tempfile.mkdtemp()
    try:
        written = apply_change_set(tmp, files)
        assert len(written) == 1
        assert os.path.isfile(written[0])
        # 落在 evocode_generated/ 下
        assert "evocode_generated" in written[0]
    finally:
        shutil.rmtree(tmp)


def test_apply_rejects_path_traversal():
    # 构造一个恶意路径，apply 应拒绝
    files = [{"path": "../../etc/evil.tsx", "content": "x"}]
    tmp = tempfile.mkdtemp()
    try:
        written = apply_change_set(tmp, files)
        assert written == []  # 拒绝
    finally:
        shutil.rmtree(tmp)


def test_deterministic():
    tasks = [{"id": "task-1", "title": "Build page", "kind": "frontend", "description": "d"}]
    a = generate_change_set(tasks, "same intent")
    b = generate_change_set(tasks, "same intent")
    assert a == b
