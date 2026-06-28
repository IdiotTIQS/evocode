"""提示词加载器：把 docs/prompts/*.md 接入运行时。

设计意图：让文档中的智能体提示词成为真实的系统提示来源，而非游离的文档。
找不到文件时返回空串——绝不抛错（遵守 "never fail /runs"）。
"""
import functools
import os

# 从本文件向上定位仓库根：llm/ -> evocode_runtime/ -> src/ -> ai-runtime/ -> <repo root>
_REPO_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
_PROMPTS_DIR = os.path.join(_REPO_ROOT, "docs", "prompts")


@functools.lru_cache(maxsize=32)
def load_prompt(name: str) -> str:
    """读取 docs/prompts/<name>.md 的全文。缺失或读失败返回空串。"""
    path = os.path.join(_PROMPTS_DIR, f"{name}.md")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""
