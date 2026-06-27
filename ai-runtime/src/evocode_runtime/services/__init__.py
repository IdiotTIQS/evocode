"""业务服务层接缝。

增量 1：Planner 流水线（LangGraph understand→plan）已实现。
后续增量接入：
- PKG 真实抽取（项目知识图谱）
- Frontend/Backend/Review/Test Agent 执行
- 验证引擎（build/lint/test 沙箱）
真实 GraphMutation → ChangeSet → 验证 闭环将由此驱动。
"""
