# EvoCode

EvoCode is a four-layer agent-driven software engineering platform that enables autonomous code generation and system evolution through intelligent intent processing.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Frontend Console (Port 3000)               │
│         User Interface & Intent Submission              │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│         Spring Boot Control Plane (Port 8080)           │
│  Orchestration, Request Routing & State Management      │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│          Python AI Runtime (Port 8000)                  │
│    Intent Analysis, Code Generation & Execution        │
└──────────────────────┬──────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────┐
│            Business Services Layer                      │
│  Validation, Storage, Sandboxing & Repository I/O      │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

- **`frontend/`** - Next.js/TypeScript frontend application
- **`control-plane/`** - Spring Boot service for orchestration
- **`ai-runtime/`** - Python service for intent processing and code generation
- **`services/`** - Business service implementations and utilities
- **`contracts/`** - Cross-layer contract definitions (single source of truth)

## Local Development

### Startup Order

Start services in this order to ensure proper initialization. These are the exact
commands verified end-to-end for increment 0 (Windows paths shown for the venv;
on macOS/Linux use `.venv/bin/...`).

1. **Python AI Runtime** (Port 8000)
   ```bash
   cd ai-runtime
   python -m venv .venv
   .venv/Scripts/python -m pip install -e ".[dev]"
   .venv/Scripts/python -m uvicorn evocode_runtime.main:app --port 8000
   ```

2. **Spring Boot Control Plane** (Port 8080)
   ```bash
   cd control-plane
   mvn spring-boot:run
   ```

3. **Frontend Console** (Port 3000)
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

### Verified End-to-End Check

With the Python runtime and Spring Boot control plane running, submit an intent
through the gateway. The request is forwarded to the Python runtime, which runs a
LangGraph `understand → plan → architect → generate → verify → review` pipeline and returns a real planned `TaskGraph`:

```bash
curl -X POST http://localhost:8080/api/intents \
  -H "Content-Type: application/json" \
  -d '{"intent":"add a comments api and a product page","projectId":"shop"}'
# → {"runId":"<uuid>","status":"completed","phase":"reviewed",
#    "taskGraph":{"tasks":[
#      {"id":"task-1","title":"实现前端界面","kind":"frontend",...},
#      {"id":"task-2","title":"实现后端 API","kind":"backend",...},
#      {"id":"task-3","title":"编写测试","kind":"test",...}]},
#    "changeSet":[{"path":"evocode_generated/...","content":"..."}],
#    "review":{"verdict":"request_changes","findings":[...],"summary":"..."},
#    "message":"Planned 3 task(s), generated 3 file(s) for project shop"}

curl http://localhost:8080/actuator/health   # → {"status":"UP"}
curl http://localhost:8000/health            # → {"status":"ok"}
```

#### With a real project knowledge graph (optional `repoPath`)

Pass `repoPath` pointing at a React/Next.js repo. The `understand` step runs the
Node ts-morph extractor (`tools/ts-extractor/`, set up once via
`cd tools/ts-extractor && npm ci`) to build a real in-memory project graph; the
Planner then plans against the actual component tree, and `graphStats` reports
what was extracted:

```bash
curl -X POST http://localhost:8080/api/intents \
  -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"E:/evocode/test/fixtures/next-app"}'
# → {"runId":"<uuid>","status":"completed","phase":"reviewed",
#    "taskGraph":{"tasks":[{"kind":"frontend",...},{"kind":"test",...}]},
#    "graphStats":{"fileCount":4,"componentCount":4,"importCount":2},
#    "review":{"verdict":"approve","findings":[...],"summary":"..."},
#    "message":"Planned 2 task(s), generated 2 file(s) for project shop"}
```

Without `repoPath` (or if Node/the extractor is unavailable), `understand` falls
back to an empty placeholder graph (`graphStats` all zero) and planning proceeds
from the intent text alone — no failure.

#### Persistent graph cache

The extracted graph is persisted (SQLite, behind a `GraphStore` interface) and
versioned by a repo fingerprint (file mtimes + sizes). When the same project's
repo is unchanged, `understand` loads the stored graph instead of re-extracting —
`graphStats.cacheHit` reports which path was taken and `graphVersionId` identifies
the stored version:

```bash
# First call for an unchanged repo → extracts and stores
# → {..., "graphStats":{"fileCount":4,...,"cacheHit":false,"graphVersionId":1}}

# Second identical call → served from the store, no re-extraction
# → {..., "graphStats":{"fileCount":4,...,"cacheHit":true,"graphVersionId":1}}
```

When the repo changes, the fingerprint differs, a new version is extracted and
stored, and prior versions are marked superseded (never deleted). The SQLite file
lives at `ai-runtime/data/pkg.db` (gitignored). A Postgres-backed `GraphStore`
can replace SQLite behind the same interface without touching callers.

#### Impact / dependency analysis

`understand` runs impact/dependency analysis over the graph's IMPORTS edges
(transitive reachability, both directions). `graphStats.maxImpactCount` reports
the largest blast radius in the project — the number of files transitively
affected if the most-depended-on file changed — and the Planner folds that signal
into its task descriptions:

```bash
# → {..., "graphStats":{"fileCount":4,"componentCount":4,"importCount":2,"maxImpactCount":1}}
#   frontend task: "...（项目现有 4 个组件）（最大影响面 1 文件）"
```

The analysis distinguishes `dependencies_of` (what a file transitively imports)
from `impact_of` (who transitively imports it — what breaks if it changes), is
cycle-safe (a file is never its own dependency), and is fully deterministic.

The pipeline now runs six nodes: **understand → plan → architect → generate → verify → review**.

The **Architect** node is deterministic and graph-driven: it reads the `ProjectGraph` produced by `understand` and emits `ArchitectureNotes` for each planned task — file locations, patterns to follow, constraints, and impact warnings. No LLM call is made here; the output is purely structural.

The **Review** node evaluates the generated `ChangeSet` and the `VerificationResult`, then emits a `ReviewOutput` with a `verdict` (`approve`, `request_changes`, or `block`), a plain-language `summary`, and a list of `ReviewFinding` items (severity, filePath, message, optional suggestedFix). The verdict is surfaced in the frontend console.

The Planner uses a deterministic stub LLM by default (no credentials needed). Set
`OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL` / `OPENAI_MODEL`) to switch the
planning node to a real prompt-driven OpenAI call; prompts are loaded from
`docs/prompts/`. A blank `intent` is rejected by the
control plane with HTTP 400 (bean validation).

### Prerequisites

- Python 3.11 (the runtime is pinned to 3.11; use a venv as shown above)
- JDK 21
- Node.js 22 + pnpm 10
- Maven 3.9
- Git

### Security Note (Increment 0)

Increment 0 has **no authentication** on the control plane or the Python runtime.
Bind both services to `localhost` only and do not expose them to a network.
The Spring Boot control plane is the designated enterprise/auth layer —
authentication, RBAC, and a tightened CORS policy land in a later increment
before any non-local deployment.

## Cross-Layer Contracts

All layers adhere to the contract definitions in the `contracts/` directory. These schemas define:

- **IntentRequest**: Structure for user intents and project context
- **RunAcknowledgement**: Response format for intent processing results

See `contracts/README.md` for details on maintaining contract consistency across layers.

## Contributing

When modifying contracts or adding features:

1. Update the contract if needed in `contracts/`
2. Synchronize changes to all affected layers
3. Test cross-layer integration
4. Document changes in relevant layer READMEs

## License

EvoCode is part of the agent-driven engineering platform.
