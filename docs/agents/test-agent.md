# Test Agent

## Role

The Test Agent generates tests for all code produced by a run. It operates after the Frontend and Backend agents have completed their generation tasks and produces tests appropriate to what was changed.

The Test Agent's output is a primary quality signal for the platform — tests generated here are what the verify phase runs. If the Test Agent produces weak or incorrect tests, the verify phase provides false confidence.

---

## Responsibilities

- Analyze all generated change files to determine what must be tested
- Generate unit tests for new functions, components, and service methods
- Generate integration tests for new API endpoints
- Generate component tests for new React components
- Ensure test coverage is proportional to the complexity of the change
- Follow the project's existing test framework and patterns exactly
- Produce tests that actually test behavior, not just structural smoke tests

---

## Input

```python
class TestGenerateInput(TypedDict):
    task: Task
    change_files: List[ChangeFile]     # Files produced by frontend/backend agents
    knowledge_graph: ProjectGraph
    architecture_notes: ArchitectureNotes
```

---

## Output

```python
class TestGenerateOutput(TypedDict):
    task_id: str
    change_files: List[ChangeFile]  # Test files to create or modify
```

---

## Test Strategy by Change Type

### New React Component

For a new React component, the Test Agent generates:

- **Render test**: Component renders without errors given valid props
- **Props variation tests**: Renders correctly with boundary prop values (empty arrays, undefined optional props)
- **Interaction tests**: User events (click, input change) produce the expected state updates or callbacks
- **Accessibility snapshot**: ARIA roles and labels are present (using `@testing-library/jest-dom`)

Framework: Jest + React Testing Library (or the project's existing test framework).

### New Spring Boot Endpoint

For a new REST controller method, the Test Agent generates:

- **Happy path test**: Valid request returns expected response and status code
- **Validation test**: Invalid request (missing required field, wrong type) returns 400
- **Not found test**: Request for a non-existent resource returns 404
- **Authentication test**: Unauthenticated request returns 401 (if the endpoint is secured)

Framework: JUnit 5 + Spring Boot Test (`@WebMvcTest` or `@SpringBootTest` based on existing usage).

### New Service Method

For a new service class or method:

- **Unit tests**: Correct output for representative inputs, using mocked dependencies
- **Edge case tests**: Empty input, null input, maximum-size input

### Modified Existing Code

When modifying existing code, the Test Agent:

1. Reads the existing test file for the modified class
2. Identifies existing tests that cover the modified logic
3. Adds or modifies tests to cover the new behavior
4. Does not remove existing tests unless they directly contradict the new implementation

---

## Test Quality Principles

The Test Agent follows these rules for all generated tests:

- **Tests test behavior, not implementation.** Tests call public interfaces, not internal methods.
- **Each test has one assertion concern.** Multiple `expect` calls are fine if they all verify the same behavior; tests do not combine unrelated assertions.
- **Test descriptions are specific.** `it('renders error state when API call fails')` not `it('works correctly')`.
- **No over-mocking.** The Test Agent uses the minimum mocking required to isolate the unit under test.
- **Tests are deterministic.** No reliance on system time, random values, or network calls unless explicitly mocked.

---

## Framework Detection

The Test Agent detects the project's existing test framework from the knowledge graph and package.json / pom.xml before generating any tests. It never introduces a new test framework — it uses exactly what is already in the project.

---

## Prompt

See [test-prompt.md](../prompts/test-prompt.md) for the full prompt templates used by this agent.
