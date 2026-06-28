# Frontend Agent

## Role

The Frontend Agent is responsible for all user interface changes. It generates React components, pages, layouts, hooks, and styles based on a task description and architecture notes from the Architect Agent.

The Frontend Agent is a specialist. It does not make backend API calls, does not modify domain models, and does not generate test code. Its output is a set of file changes to the project's frontend layer.

---

## Responsibilities

- Generate new React components that match the project's existing patterns
- Modify existing components to incorporate requested changes
- Create or update Next.js pages and route handlers
- Add or modify React hooks for state management
- Update navigation, routing, and layout files when new pages are added
- Apply consistent styling using the project's existing CSS framework
- Generate TypeScript types for component props and local state
- Produce clean, reviewable diffs — no unnecessary whitespace changes

---

## Input

```python
class FrontendGenerateInput(TypedDict):
    task: Task                        # Task definition from the Planner
    architecture_notes: ArchitectureNotes  # Constraints from the Architect
    knowledge_graph: ProjectGraph     # Current project graph
```

---

## Output

```python
class ChangeFile(TypedDict):
    path: str             # File path relative to repo root
    operation: Literal['create', 'modify', 'delete']
    content: str          # Full file content (for create/modify)
    description: str      # What changed and why

class FrontendGenerateOutput(TypedDict):
    task_id: str
    change_files: List[ChangeFile]
```

---

## Generation Strategy

### Component Creation

When creating a new component, the Frontend Agent:

1. Reads 2–3 existing components from the project to understand naming, structure, and styling conventions
2. Identifies the correct directory location from architecture notes
3. Generates the component with:
   - TypeScript props interface
   - Consistent import style (relative vs absolute, ordering)
   - Existing state management pattern (Context hook, Zustand store, etc.)
   - Styling consistent with the existing framework (Tailwind classes, CSS modules, styled-components)
4. Adds the component to any relevant index exports if the project uses barrel files

### Page Creation

When creating a new Next.js page:

1. Follows the project's App Router or Pages Router structure (detected from the knowledge graph)
2. Generates the page component, metadata export, and any required data-fetching patterns (`getServerSideProps`, `generateStaticParams`, etc.)
3. Updates the navigation component if one exists in the project
4. Creates a corresponding loading and error boundary if the project pattern includes them

### Existing Component Modification

When modifying an existing component:

1. Reads the full current file before generating any output
2. Makes targeted changes — does not reformat, rename, or refactor code outside the scope of the task
3. Preserves all existing comments, type annotations, and non-task-related logic
4. Applies the Minimal Change Principle: produces the smallest diff that satisfies the task

---

## Tool Usage

The Frontend Agent uses the following tools:

| Tool | Purpose |
|---|---|
| `read_file` | Read existing components before modification |
| `list_files` | Enumerate components in the relevant directory |
| `get_component` | Retrieve component metadata from the knowledge graph |
| `get_dependencies` | Understand what a component imports |
| `retrieve_context` | RAG retrieval for relevant patterns and examples |
| `write_file` | Stage the generated or modified file |

---

## Constraints

- The Frontend Agent never calls backend APIs directly — all API integration uses the existing API client layer
- The Frontend Agent never introduces new dependencies (npm packages) without explicit architecture approval
- The Frontend Agent never modifies files outside the frontend layer (no changes to `control-plane/` or `ai-runtime/`)

---

## Prompt

See [frontend-prompt.md](../prompts/frontend-prompt.md) for the full prompt templates used by this agent.
