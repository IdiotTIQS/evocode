import os
from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.models import EngineeringTask


class OpenAiLlmProvider(LlmGateway):
    """OpenAI 兼容 provider。从环境变量读取配置。
    本增量仅提供骨架：若被激活但未实现完整调用，回退到简单解析。
    真实 LLM 调用在后续增量完善。"""

    def __init__(self) -> None:
        self.base_url = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
        self.api_key = os.environ.get("OPENAI_API_KEY")
        self.model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")

    @staticmethod
    def is_available() -> bool:
        return bool(os.environ.get("OPENAI_API_KEY"))

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        # 后续增量实现真实 OpenAI 调用。当前激活时返回单一通用任务占位。
        return [EngineeringTask(
            id="task-1", title="实现变更", kind="generic",
            description=f"[openai:{self.model}] 实现意图：{intent}")]
