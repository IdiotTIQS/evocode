import json
import os
import shutil
import subprocess
from pathlib import Path

NOISE_CODES = {2307, 2304, 2503, 7026, 2874}


class VerificationError(Exception):
    pass


def filter_noise(diagnostics: list[dict]) -> list[dict]:
    return [d for d in diagnostics if d.get("code") not in NOISE_CODES]


def _default_check_js() -> str:
    here = Path(__file__).resolve()
    repo_root = here.parents[4]
    return str(repo_root / "tools" / "ts-checker" / "check.js")


class TsVerifier:
    def __init__(self, check_js: str | None = None) -> None:
        self.check_js = check_js or os.environ.get("EVOCODE_CHECK_JS", _default_check_js())

    @staticmethod
    def node_available() -> bool:
        return shutil.which("node") is not None

    def is_available(self) -> bool:
        js = Path(self.check_js)
        tsm = js.parent.parent / "ts-extractor" / "node_modules"
        return self.node_available() and js.is_file() and tsm.is_dir()

    def check(self, repo_path: str) -> dict:
        if not self.is_available():
            raise VerificationError("node or checker not available")
        if not os.path.isdir(repo_path):
            raise VerificationError(f"not a directory: {repo_path}")
        try:
            proc = subprocess.run(
                ["node", self.check_js, repo_path],
                capture_output=True, text=True, check=True, timeout=120)
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise VerificationError(f"checker failed: {exc}") from exc
        try:
            raw = json.loads(proc.stdout)
        except json.JSONDecodeError as exc:
            raise VerificationError(f"invalid checker output: {exc}") from exc
        if not isinstance(raw, dict) or not isinstance(raw.get("diagnostics"), list):
            raise VerificationError("unexpected checker output shape")
        meaningful = filter_noise(raw["diagnostics"])
        return {"passed": len(meaningful) == 0,
                "diagnostics": meaningful,
                "diagnosticCount": len(meaningful)}
