"""OpenAI 兼容 provider：把 docs/prompts 的规划提示词接入真实 LLM 调用。

激活条件：环境变量 OPENAI_API_KEY 存在。任何异常（网络/解析）都回退到
单一通用任务，绝不让规划阶段抛错。
"""
import json
import logging
import os

import httpx

from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.llm.prompts import load_prompt
from evocode_runtime.models import EngineeringTask

logger = logging.getLogger(__name__)

_VALID_KINDS = {"frontend", "backend", "test", "generic"}


class OpenAiLlmProvider(LlmGateway):
    def __init__(self) -> None:
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    @staticmethod
    def is_available() -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def _system_prompt(self) -> str:
        master = load_prompt("master-prompt")
        planner = load_prompt("planner-prompt")
        guidance = (
            "你是 EvoCode 的规划智能体。把用户意图拆解为工程任务，"
            '只输出 JSON 数组，每个元素形如 '
            '{"id":"task-1","title":"...","kind":"frontend|backend|test|generic","description":"..."}。'
            "不要输出 JSON 以外的任何文字。"
        )
        return "\n\n".join(p for p in (master, planner, guidance) if p)

    def _fallback(self, intent: str) -> list[EngineeringTask]:
        return [EngineeringTask(
            id="task-1", title="实现变更", kind="generic",
            description=f"[openai:{self.model}] 实现意图：{intent}")]

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        stats = (context or {}).get("stats") or {}
        user_msg = (f"意图：{intent}\n"
                    f"项目现状：{stats.get('fileCount', 0)} 文件 / "
                    f"{stats.get('componentCount', 0)} 组件。")
        try:
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": self._system_prompt()},
                        {"role": "user", "content": user_msg},
                    ],
                    "temperature": 0,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
            raw = json.loads(content)
            tasks = []
            for i, item in enumerate(raw, start=1):
                kind = item.get("kind")
                if kind not in _VALID_KINDS:
                    kind = "generic"
                tasks.append(EngineeringTask(
                    id=item.get("id") or f"task-{i}",
                    title=item.get("title") or "实现变更",
                    kind=kind,
                    description=item.get("description") or intent))
            return tasks or self._fallback(intent)
        except Exception:  # noqa: BLE001  网络/解析/结构任何异常 → 回退
            logger.exception("OpenAiLlmProvider.plan failed, falling back")
            return self._fallback(intent)
