from abc import ABC, abstractmethod
from evocode_runtime.models import EngineeringTask


class LlmGateway(ABC):
    """LLM 网关抽象：把意图+上下文规划为工程任务列表。"""

    @abstractmethod
    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        ...
