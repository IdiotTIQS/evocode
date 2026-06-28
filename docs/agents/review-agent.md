# Review Agent

## Role

The Review Agent performs automated code review on the complete set of changes produced by a run. It evaluates the generated diff for correctness, quality, consistency, and security before the changes are presented to the developer for final approval.

The Review Agent is the platform's quality gate. It is intentionally critical — a finding from the Review Agent should carry the same weight as a finding from a senior developer in a code review.

---

## Responsibilities

- Review every file in the change set for correctness issues
- Identify logic errors, off-by-one errors, null pointer risks, and type mismatches
- Check for consistency with the existing codebase style and patterns
- Flag security issues: injection vulnerabilities, exposed credentials, missing input validation
- Verify that the changes address the original intent fully
- Produce structured findings with severity, location, and recommended fix
- Issue an overall verdict: `approve`, `request_changes`, or `block`

---

## Input

```python
class ReviewInput(TypedDict):
    intent: str
    task_graph: TaskGraph
    change_files: List[ChangeFile]
    verification_result: VerificationResult
    knowledge_graph: ProjectGraph
```

---

## Output

```python
class ReviewFinding(TypedDict):
    severity: Literal['critical', 'major', 'minor', 'suggestion']
    file_path: str
    line_range: Optional[tuple[int, int]]
    message: str
    suggested_fix: Optional[str]

class ReviewOutput(TypedDict):
    verdict: Literal['approve', 'request_changes', 'block']
    findings: List[ReviewFinding]
    summary: str  # One-paragraph summary for the human reviewer
```

---

## Verdict Semantics

| Verdict | Meaning |
|---|---|
| `approve` | No critical or major findings. Minor findings and suggestions are informational. |
| `request_changes` | One or more major findings require resolution before the change is applied. |
| `block` | One or more critical findings (security vulnerability, data loss risk, compilation failure). Change must not be applied until resolved. |

---

## Review Dimensions

### Correctness

- Does the implementation satisfy the intent?
- Are there logic errors in the generated code?
- Are all edge cases handled (empty collections, null inputs, network failures)?
- Does the code compile (verified by the verify phase, but the reviewer flags any residual type issues)?

### Security

- Is user input validated before use?
- Are SQL queries parameterized (or is the ORM used correctly to prevent injection)?
- Are there hardcoded secrets or API keys?
- Does authentication/authorization logic look correct for new endpoints?
- Are there XSS risks in frontend output?

### Consistency

- Does the code follow the naming conventions identified by the Architect?
- Are error handling patterns consistent with the rest of the codebase?
- Are imports organized consistently?
- Is the abstraction level appropriate (not too specific, not over-engineered)?

### Completeness

- Are tests generated for all new or modified functionality?
- Are new API endpoints documented (OpenAPI annotations)?
- Are new components accessible (ARIA attributes, keyboard navigation)?

---

## Relationship to the Verify Phase

The verify phase runs automated tools (type checker, linter, test suite). The Review Agent runs after verification and interprets its results, but it also applies judgment that automated tools cannot:

- A test that passes but does not actually test the right thing
- Code that is syntactically correct but logically wrong
- A pattern that works but is inconsistent with the rest of the codebase

These are the Review Agent's domain.

---

## Prompt

See [review-prompt.md](../prompts/review-prompt.md) for the full prompt templates used by this agent.
