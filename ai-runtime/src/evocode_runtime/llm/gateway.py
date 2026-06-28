from abc import ABC, abstractmethod
from evocode_runtime.models import EngineeringTask


class LlmGateway(ABC):
    """LLM 网关抽象：规划工程任务、生成代码。"""

    @abstractmethod
    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        ...

    @abstractmethod
    def generate_code(self, task: dict, intent: str, note: dict | None) -> str | None:
        """为单个任务生成文件内容（完整代码字符串）。

        返回 None 表示本 provider 不做 LLM 生成（如 stub）或生成失败——
        调用方据此回退到确定性模板，保证 generate 阶段绝不失败。"""
        ...

