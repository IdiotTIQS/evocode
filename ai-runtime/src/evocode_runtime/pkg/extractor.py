import json
import os
import shutil
import subprocess
from pathlib import Path


class ExtractionError(Exception):
    pass


def _default_extractor_js() -> str:
    # 仓库根: ai-runtime/src/evocode_runtime/pkg/extractor.py → 上溯 4 层到 repo 根
    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    return str(repo_root / "tools" / "ts-extractor" / "extract.js")


class TsExtractor:
    """经 subprocess 调用 Node ts-morph 抽取器，返回 {nodes,edges}。"""

    def __init__(self, extractor_js: str | None = None) -> None:
        self.extractor_js = extractor_js or os.environ.get(
            "EVOCODE_EXTRACTOR_JS", _default_extractor_js())

    @staticmethod
    def node_available() -> bool:
        return shutil.which("node") is not None

    def is_available(self) -> bool:
        js = Path(self.extractor_js)
        return (self.node_available()
                and js.is_file()
                and (js.parent / "node_modules").is_dir())

    def extract(self, repo_path: str) -> dict:
        if not self.is_available():
            raise ExtractionError("node or extractor not available")
        if not os.path.isdir(repo_path):
            raise ExtractionError(f"not a directory: {repo_path}")
        try:
            proc = subprocess.run(
                ["node", self.extractor_js, repo_path],
                capture_output=True, text=True, check=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise ExtractionError(f"extractor failed: {exc}") from exc
        try:
            return json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise ExtractionError(f"invalid extractor output: {exc}") from exc
