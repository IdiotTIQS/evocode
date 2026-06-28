"""审查智能体（确定性）：在 verify 之后运行，对变更集出具裁定。

依据 docs/agents/review-agent.md 的维度做静态判断：正确性（验证结果）、
安全（硬编码密钥）、完整性（是否生成测试）。相同输入产出相同裁定。
"""
import re

from evocode_runtime.models import ReviewFinding, ReviewOutput

# 简单的密钥特征：OpenAI 风格 key、长十六进制串赋值给 *key/secret/token/password
_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9]{16,}"),
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[=:]\s*['\"][^'\"]{12,}['\"]"),
]

_SEVERITY_RANK = {"suggestion": 0, "minor": 1, "major": 2, "critical": 3}


def _verdict(findings: list[ReviewFinding]) -> str:
    worst = max((_SEVERITY_RANK[f.severity] for f in findings), default=0)
    if worst >= _SEVERITY_RANK["critical"]:
        return "block"
    if worst >= _SEVERITY_RANK["major"]:
        return "request_changes"
    return "approve"


def review_change_set(intent: str, tasks: list[dict], change_set: list[dict],
                      verification: dict) -> dict:
    """产出序列化的 ReviewOutput（by_alias）。"""
    findings: list[ReviewFinding] = []

    # 正确性：验证未通过 → critical
    v = verification or {}
    if v.get("checked") and not v.get("passed"):
        findings.append(ReviewFinding(
            severity="critical", file_path="(verify)",
            message=f"静态类型检查未通过：{v.get('diagnosticCount', 0)} 个诊断，"
                    f"应用前必须修复。",
            suggested_fix="修复类型错误后重跑验证。"))

    # 安全：扫描硬编码密钥 → critical
    for f in change_set or []:
        content = f.get("content", "")
        if any(p.search(content) for p in _SECRET_PATTERNS):
            findings.append(ReviewFinding(
                severity="critical", file_path=f.get("path", "?"),
                message="疑似硬编码密钥/凭证（hardcoded secret），存在泄露风险。",
                suggested_fix="改用环境变量或密钥管理服务。"))

    # 完整性：是否产出测试
    has_test_file = any("test" in f.get("path", "").lower() for f in (change_set or []))
    has_test_task = any(t.get("kind") == "test" for t in (tasks or []))
    if change_set and not has_test_file:
        findings.append(ReviewFinding(
            severity="major", file_path="(change set)",
            message="变更未包含任何测试文件（missing tests）。",
            suggested_fix="为新增/修改的功能补充测试。" if has_test_task
            else "在计划中加入测试任务并生成测试。"))

    # 一致性：占位实现提示 → suggestion
    for f in change_set or []:
        if "TODO" in f.get("content", ""):
            findings.append(ReviewFinding(
                severity="suggestion", file_path=f.get("path", "?"),
                message="生成内容含 TODO 占位，需后续补全真实实现。",
                suggested_fix=None))

    verdict = _verdict(findings)
    n_crit = sum(1 for f in findings if f.severity == "critical")
    n_major = sum(1 for f in findings if f.severity == "major")
    summary = (f"裁定 {verdict}：{len(findings)} 条发现"
               f"（critical {n_crit} / major {n_major}）。意图：{intent[:60]}")
    return ReviewOutput(verdict=verdict, findings=findings, summary=summary).model_dump(by_alias=True)
