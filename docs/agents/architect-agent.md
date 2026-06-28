# Architect Agent

## Role

The Architect Agent makes architecture decisions and evaluates the impact of proposed changes on the existing codebase. It runs after the Planner has produced a TaskGraph and before any generation agent begins implementing a task.

The Architect is the platform's design conscience. It ensures that generated code is architecturally consistent with the existing system — following naming conventions, respecting existing abstractions, and respecting the constraints of the current design.

---

## Responsibilities

- Analyze each task in the context of the current knowledge graph
- Identify existing patterns and conventions that must be followed
- Determine whether new abstractions are needed or existing ones should be extended
- Evaluate the impact of the task on components not explicitly mentioned in the plan
- Produce concrete architecture notes for the generation agent: file locations, class names, interface contracts, patterns to follow
- Flag tasks with high impact or architectural risk for human review before generation proceeds

---

## Input

```python
class ArchitectInput(TypedDict):
    task: Task                     # The task to evaluate
    knowledge_graph: ProjectGraph  # Current project graph
    task_graph: TaskGraph          # Full plan for context (other tasks)
    prior_architecture_notes: List[ArchitectureNotes]  # Notes from sibling tasks
```

---

## Output

```python
class ArchitectureNotes(TypedDict):
    task_id: str
    file_locations: Dict[str, str]  # logical name → suggested file path
    new_abstractions: List[Abstraction]  # New types/interfaces to introduce
    existing_to_extend: List[str]  # Existing components to modify
    patterns_to_follow: List[str]  # Naming conventions, structural patterns
    impact_warning: Optional[str]  # If high-risk, human-readable warning
    constraints: List[str]         # Hard constraints the generator must respect
```

---

## Architecture Analysis

### Pattern Recognition

The Architect examines the existing codebase structure to identify:

- **Naming conventions**: Are components named with `Page`, `View`, `Container`, or `Component` suffixes? Are services named with `Service` or `Manager`?
- **File organization**: Are components co-located with their tests? Is there a feature-based or type-based directory structure?
- **State management patterns**: Does the project use React Context, Zustand, Redux, or server state?
- **API design patterns**: Does the backend use RESTful resource naming, CQRS, or another pattern?

These observations become constraints for the generation agents: the generated code must conform to the project's existing conventions, not invent new ones.

### Impact Assessment

For each task, the Architect runs an impact query on the knowledge graph: what is the set of files that transitively depend on the files this task will modify? If the impact set is large, the Architect adds a warning to the notes and may recommend that the task be split into smaller increments.

### Cross-Task Consistency

When multiple tasks in the same run touch related components, the Architect ensures consistency across tasks. If the backend task creates a `ProductDto` and the frontend task renders a product card, the Architect ensures both tasks agree on the shape of that DTO before generation begins.

---

## Relationship to Other Agents

- **Depends on**: Planner (task definitions), Knowledge Graph (current state)
- **Feeds into**: Frontend Agent, Backend Agent (via architecture notes in the run state)
- **Coordinates with**: Other Architect evaluations for sibling tasks (to catch cross-task inconsistencies)

---

## Prompt

See [architect-prompt.md](../prompts/architect-prompt.md) for the full prompt templates used by this agent.
