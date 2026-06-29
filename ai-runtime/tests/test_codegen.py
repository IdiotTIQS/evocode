from evocode_runtime.codegen import generate_change_set, apply_change_set
import evocode_runtime.codegen.generator as generator
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


def test_uses_llm_content_when_gateway_provides(monkeypatch):
    """gateway.generate_code 返回真实代码时，codegen 用 LLM 产物（而非模板），路径仍由模板决定。"""
    real_code = "// real LLM output\nexport function Contact() { return <form/>; }\n"
    monkeypatch.setattr(generator, "_try_llm_code", lambda task, intent, note, history, existing: real_code)
    tasks = [{"id": "task-1", "title": "Contact", "kind": "frontend", "description": "form"}]
    files = generate_change_set(tasks, "add contact")
    assert files[0]["content"] == real_code           # 用了 LLM 产物
    assert files[0]["path"].endswith(".tsx")           # 路径仍是模板逻辑
    assert "// TODO: implement" not in files[0]["content"]


def test_falls_back_to_template_when_llm_returns_none(monkeypatch):
    """gateway 返回 None（stub/失败）时，回退确定性模板，保证不失败。"""
    monkeypatch.setattr(generator, "_try_llm_code", lambda task, intent, note, history, existing: None)
    tasks = [{"id": "task-1", "title": "Contact", "kind": "frontend", "description": "form"}]
    files = generate_change_set(tasks, "add contact")
    assert "export default" in files[0]["content"]     # 模板特征
    assert files[0]["path"].endswith(".tsx")


def test_prior_change_set_passed_as_existing_baseline(monkeypatch):
    """迭代编辑：prior 中同 path 的内容作为 existing 基线传给 LLM。"""
    seen = {}

    def capture(task, intent, note, history, existing):
        seen["existing"] = existing
        seen["history"] = history
        return "// edited\nexport default function Feature(){return null}\n"

    monkeypatch.setattr(generator, "_try_llm_code", capture)
    # 先求模板会落到的 path，再用同 path 构造 prior
    base = generator.generate_files_for_task(
        {"id": "task-1", "title": "Feature", "kind": "frontend", "description": "x"}, "x")
    path = base[0]["path"]
    prior = [{"path": path, "content": "export default function Feature(){return <form/>}"}]
    history = [{"role": "user", "text": "上一轮做了表单"}]
    tasks = [{"id": "task-1", "title": "Feature", "kind": "frontend", "description": "加手机号"}]
    files = generate_change_set(tasks, "加手机号", history=history, prior=prior)
    assert seen["existing"] == prior[0]["content"]      # 同 path → existing 基线
    assert seen["history"] == history
    assert files[0]["path"] == path                      # 覆盖同一文件（迭代编辑）


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


def test_generate_uses_architect_file_location():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    notes = [{
        "taskId": "task-1",
        "fileLocations": {"primary": "evocode_generated/components/ContactPage.tsx"},
        "patternsToFollow": ["沿用现有组件命名风格（如 Button, Card）"],
        "constraints": ["最小化改动"],
        "newAbstractions": [], "existingToExtend": [], "impactWarning": None,
    }]
    files = generate_change_set(tasks, "add a contact page", notes)
    assert any(f["path"] == "evocode_generated/components/ContactPage.tsx" for f in files)
    # 架构模式应被写入生成文件的注释，形成可见的可追溯链路
    target = next(f for f in files if f["path"].endswith("ContactPage.tsx"))
    assert "沿用现有组件命名风格" in target["content"]


def test_generate_without_notes_is_backward_compatible():
    tasks = [{"id": "task-1", "title": "联系页", "kind": "frontend", "description": "做页面"}]
    files_no_notes = generate_change_set(tasks, "x")
    files_none = generate_change_set(tasks, "x", None)
    assert files_no_notes == files_none
    assert len(files_no_notes) == 1
    assert files_no_notes[0]["path"].startswith("evocode_generated/components/")


def test_generate_rejects_backslash_traversal_in_note_path():
    tasks = [{"id": "task-1", "title": "X", "kind": "frontend", "description": "d"}]
    notes = [{"taskId": "task-1",
              "fileLocations": {"primary": "evocode_generated/foo\\..\\..\\evil.tsx"},
              "patternsToFollow": [], "constraints": [], "impactWarning": None,
              "newAbstractions": [], "existingToExtend": []}]
    files = generate_change_set(tasks, "x", notes)
    # 恶意反斜杠穿越路径必须被拒绝，回退到默认 components/ 落点
    assert all("evil" not in f["path"] for f in files)
    assert files[0]["path"].startswith("evocode_generated/components/")
