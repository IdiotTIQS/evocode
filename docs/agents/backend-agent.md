# Backend Agent

## Role

The Backend Agent is responsible for all server-side implementation. It generates Spring Boot controllers, service classes, repositories, domain models, database migrations, and API contracts based on a task description and architecture notes from the Architect Agent.

The Backend Agent is a specialist. It does not generate frontend components, does not write frontend tests, and does not modify knowledge graph extraction logic. Its output is a set of file changes to the project's backend layer.

---

## Responsibilities

- Generate Spring Boot REST controllers with correct request/response mapping
- Create service layer classes implementing business logic
- Create or modify JPA repository interfaces
- Generate JPA entity (domain model) classes
- Generate Flyway or Liquibase database migration scripts
- Generate OpenAPI annotations for new or modified endpoints
- Respect the existing package structure and naming conventions identified by the Architect
- Ensure generated code compiles and passes the type checker

---

## Input

```python
class BackendGenerateInput(TypedDict):
    task: Task
    architecture_notes: ArchitectureNotes
    knowledge_graph: ProjectGraph
```

---

## Output

```python
class BackendGenerateOutput(TypedDict):
    task_id: str
    change_files: List[ChangeFile]
```

---

## Generation Strategy

### New API Endpoint

When creating a new REST endpoint:

1. Read the existing controller in the same package (if one exists) to understand the request/response pattern
2. Create or extend the controller class with the new method
3. Create or extend the service interface and implementation
4. Create or extend the repository if persistence is required
5. Create or extend the domain model if a new entity is required
6. Generate the migration script if the schema changes
7. Add OpenAPI annotations (`@Operation`, `@ApiResponse`, `@Schema`) consistent with the project's existing documentation style

### Existing Endpoint Modification

When modifying an existing endpoint:

1. Read the full controller, service, and repository files before generating output
2. Identify the specific method(s) affected by the task
3. Apply targeted changes — does not refactor unrelated methods or reorganize imports
4. Updates the corresponding DTO if the request/response shape changes
5. Generates a migration if the schema changes

### DTO Generation

Request and response DTOs are generated as Java records (Java 21) or POJOs with Lombok annotations, matching the project's existing DTO style. DTOs include Jakarta Bean Validation annotations where appropriate (`@NotNull`, `@NotBlank`, `@Size`, etc.).

---

## Tool Usage

| Tool | Purpose |
|---|---|
| `read_file` | Read existing controllers, services, repositories before modification |
| `list_files` | Enumerate classes in the relevant package |
| `get_component` | Retrieve API endpoint metadata from the knowledge graph |
| `get_dependencies` | Understand the service/repository layer a controller depends on |
| `retrieve_context` | RAG retrieval for relevant patterns and domain models |
| `write_file` | Stage the generated or modified file |

---

## Constraints

- The Backend Agent never introduces new Spring Boot dependencies without explicit architecture approval
- The Backend Agent never modifies the Spring Security configuration
- The Backend Agent never modifies files outside the backend layer (no changes to `frontend/` or `ai-runtime/`)
- All generated endpoints respect the existing CORS configuration
- All generated code compiles under Java 21

---

## Prompt

See [backend-prompt.md](../prompts/backend-prompt.md) for the full prompt templates used by this agent.
