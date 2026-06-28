from evocode_runtime.llm.gateway import LlmGateway
from evocode_runtime.models import EngineeringTask

_FRONTEND_KW = ("page", "页面", "ui", "component", "组件", "feed")
_BACKEND_KW = ("api", "endpoint", "接口", "service", "服务", "entity", "数据库")


class StubLlmProvider(LlmGateway):
    """确定性规则规划器，无需外部凭证。相同输入产出相同任务。"""

    def plan(self, intent: str, context: dict) -> list[EngineeringTask]:
        low = intent.lower()
        stats = (context or {}).get("stats") or {}
        comp_n = stats.get("componentCount", 0)
        max_impact = stats.get("maxImpactCount", 0)
        impact_note = f"（最大影响面 {max_impact} 文件）" if max_impact else ""
        tasks: list[EngineeringTask] = []
        n = 0
        if any(k in low for k in _FRONTEND_KW):
            n += 1
            extra = f"（项目现有 {comp_n} 个组件）" if comp_n else ""
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现前端界面", kind="frontend",
                description=f"为意图实现 React/Next.js 界面：{intent}{extra}{impact_note}"))
        if any(k in low for k in _BACKEND_KW):
            n += 1
            tasks.append(EngineeringTask(
                id=f"task-{n}", title="实现后端 API", kind="backend",
                description=f"为意图实现 Spring Boot 端点/服务：{intent}{impact_note}"))
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

    def generate_code(self, task: dict, intent: str, note: dict | None) -> str | None:
        """stub 不做 LLM 生成——返回 None，由 codegen 回退到确定性模板。"""
        return None
