from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.models import EngineeringTask

_FRONTEND_KW = ("page", "页面", "ui", "component", "组件", "feed")
_BACKEND_KW = ("api", "endpoint", "接口", "service", "服务", "entity", "数据库")


class StubLlmProvider(LlmGateway):
    """确定性规则规划器，无需外部凭证。相同输入产出相同任务。"""

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        low = intent.lower()
        tasks: list[EngineeringTask] = []
        n = 0
        if any(k in low for k in _FRONTEND_KW):
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现前端界面", kind="frontend",
                description=f"为意图实现 React/Next.js 界面：{intent}"))
        if any(k in low for k in _BACKEND_KW):
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现后端 API", kind="backend",
                description=f"为意图实现 Spring Boot 端点/服务：{intent}"))
        if not tasks:
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现变更", kind="generic",
                description=f"实现意图：{intent}"))
        n += 1
        tasks.append(EngineeringTask(
            id=f"task-{n}", title="编写测试", kind="test",
            description="为上述变更编写单元/集成测试"))
        return tasks
