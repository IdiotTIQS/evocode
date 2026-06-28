# Planner Agent

## Role

The Planner Agent converts a developer's intent into a structured engineering plan — a `TaskGraph` of concrete, executable tasks for downstream agents.

The Planner is the first agent in every run. Its output determines everything that follows: what gets built, by whom, and in what order.

---

## Responsibilities

- Parse and interpret the intent in the context of the project's knowledge graph
- Identify what changes are required: new files, modified files, new API endpoints, new components
- Decompose the work into tasks of appropriate granularity (not too large to be atomic, not too small to be meaningless)
- Classify each task by kind: `frontend`, `backend`, `test`, `review`, `migration`
- Identify ordering constraints: which tasks depend on others
- Annotate each task with relevant context from the knowledge graph (affected components, estimated impact)

---

## Input

```python
class PlanInput(TypedDict):
    intent: str               # Natural language requirement
    project_id: str           # Project identifier
    knowledge_graph: ProjectGraph  # Extracted knowledge graph
    graph_stats: GraphStats   # File count, component count, max impact
```

---

## Output

```python
class Task(TypedDict):
    id: str                   # Unique task identifier within the run
    kind: Literal['frontend', 'backend', 'test', 'review', 'migration']
    title: str                # Short description (one sentence)
    description: str          # Detailed description for the executing agent
    affected_files: List[str] # Hints from the knowledge graph
    depends_on: List[str]     # IDs of tasks that must complete first
    estimated_impact: int     # Number of files transitively affected

class TaskGraph(TypedDict):
    tasks: List[Task]
```

---

## Planning Strategy

The Planner uses a two-step internal process:

**Step 1: Intent decomposition** — The Planner determines the full scope of work implied by the intent. It asks: what new components are needed? What existing components must change? What backend APIs are required? What tests must be written?

**Step 2: Task structuring** — The Planner organizes the work into a dependency-ordered set of tasks. Backend changes that are required by frontend changes are ordered first. Test tasks are ordered last. Review tasks follow generation tasks.

The Planner does not generate code. Its output is a plan, not an implementation.

---

## Knowledge Graph Integration

The Planner uses the knowledge graph to:

- Find existing components that may be reused rather than re-created
- Identify files that will likely be affected based on import chains
- Estimate the blast radius (impact count) of proposed changes
- Detect potential conflicts with recent changes (if change history is available)
- Surface naming conventions and patterns for use in task descriptions

When the graph is empty (first run, or extractor unavailable), the Planner falls back to planning from intent text alone, producing a reasonable but less precisely-grounded plan.

---

## Error Handling

- If the intent is empty or too vague to produce a plan, the Planner returns a structured error with a request for clarification
- If the knowledge graph is unavailable, the Planner proceeds with a degraded plan and marks it as ungrounded
- The Planner never silently produces an empty task graph — if no tasks can be identified, it returns an error

---

## Stub Behavior (Local Development)

When running with the deterministic stub LLM, the Planner produces a fixed but structurally valid TaskGraph with three tasks: one `frontend`, one `backend`, and one `test`. Task descriptions are derived from the intent text. This allows the full run pipeline to be exercised without LLM credentials.

---

## Prompt

See [planner-prompt.md](../prompts/planner-prompt.md) for the full system and user prompt templates used by this agent.
