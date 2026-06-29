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

    def plan(self, intent: str, context: dict, history: list | None = None) -> list[EngineeringTask]:
        stats = (context or {}).get("stats") or {}
        user_msg = (f"意图：{intent}\n"
                    f"项目现状：{stats.get('fileCount', 0)} 文件 / "
                    f"{stats.get('componentCount', 0)} 组件。")
        try:
            messages = [{"role": "system", "content": self._system_prompt()}]
            messages.extend(self._history_messages(history))
            messages.append({"role": "user", "content": user_msg})
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": messages,
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

    # ── 代码生成 ──────────────────────────────────────────────────────────────
    # task.kind → 对应角色提示词（docs/prompts）。
    _KIND_PROMPT = {
        "frontend": "frontend-prompt",
        "backend": "backend-prompt",
        "test": "test-prompt",
    }

    def _codegen_system_prompt(self, kind: str) -> str:
        master = load_prompt("master-prompt")
        role = load_prompt(self._KIND_PROMPT.get(kind, "")) if kind in self._KIND_PROMPT else ""
        guidance = (
            "你是 EvoCode 的代码生成智能体。根据给定任务与架构笔记，直接产出"
            "【单个文件的完整可用代码】。只输出代码本身，不要任何解释、不要 Markdown "
            "代码围栏（``` 之类），不要前后缀文字。代码必须是该任务的真实实现，"
            "而非 TODO 占位。"
        )
        return "\n\n".join(p for p in (master, role, guidance) if p)

    @staticmethod
    def _strip_code_fence(text: str) -> str:
        """去掉 LLM 可能加的 Markdown 代码围栏（```lang ... ```）。"""
        s = text.strip()
        if s.startswith("```"):
            lines = s.split("\n")
            # 去首行 ```lang
            lines = lines[1:]
            # 去末行 ```
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            s = "\n".join(lines)
        return s.strip() + "\n"

    @staticmethod
    def _history_messages(history: list | None) -> list[dict]:
        """把会话历史（{role,text}）转成 chat 消息，role=agent→assistant。

        只取最近若干轮、截断每条长度，避免 prompt 过长。"""
        msgs: list[dict] = []
        for turn in (history or [])[-12:]:
            role = "assistant" if turn.get("role") == "agent" else "user"
            text = (turn.get("text") or "")[:2000]
            if text:
                msgs.append({"role": role, "content": text})
        return msgs

    def generate_code(self, task: dict, intent: str, note: dict | None,
                      history: list | None = None,
                      existing: str | None = None) -> str | None:
        """用 LLM 为单个任务生成完整文件内容；任何异常/空 → 返回 None 让调用方回退模板。

        history：多轮对话上下文；existing：该文件上一轮内容（提供则要求在其基础上迭代修改）。"""
        kind = task.get("kind", "generic")
        notes_txt = ""
        if note:
            patterns = note.get("patternsToFollow") or []
            constraints = note.get("constraints") or []
            loc = (note.get("fileLocations") or {}).get("primary")
            parts = []
            if loc:
                parts.append(f"目标文件：{loc}")
            if patterns:
                parts.append("应遵循的模式：" + "；".join(patterns))
            if constraints:
                parts.append("约束：" + "；".join(constraints))
            notes_txt = "\n".join(parts)
        if existing:
            edit_instr = (
                "这是该文件【当前内容】，请在其基础上按本次意图做最小必要修改，"
                "输出修改后的【完整文件】（不是 diff）：\n"
                f"```\n{existing[:6000]}\n```\n"
            )
        else:
            edit_instr = "这是一个新文件。\n"
        user_msg = (
            f"意图：{intent}\n"
            f"任务：[{kind}] {task.get('title')} — {task.get('description', '')}\n"
            f"{notes_txt}\n"
            f"{edit_instr}"
            "请输出实现该任务的单个文件的完整代码。"
        )
        try:
            messages = [{"role": "system", "content": self._codegen_system_prompt(kind)}]
            messages.extend(self._history_messages(history))
            messages.append({"role": "user", "content": user_msg})
            resp = httpx.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": self.model,
                    "messages": messages,
                    "temperature": 0,
                    # 推理模型（如 deepseek-v4-pro）先耗 reasoning tokens 再出 content，
                    # 留足额度，否则 content 可能为空。
                    "max_tokens": 8000,
                },
                timeout=120.0,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"].get("content") or ""
            code = self._strip_code_fence(content)
            # 太短视为无效产出 → 回退模板。
            return code if len(code.strip()) >= 10 else None
        except Exception:  # noqa: BLE001
            logger.exception("OpenAiLlmProvider.generate_code failed, falling back to template")
            return None
