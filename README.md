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

### One-command start (recommended)

The whole stack (AI Runtime :8000 → Control Plane :8080 → Frontend :3000) starts in
dependency order, each waited on a health check, with the JWT secret generated and
injected automatically.

**Windows (PowerShell):**
```powershell
pwsh scripts/start.ps1 setup   # first time only: install deps (venv / npm / pnpm)
pwsh scripts/start.ps1         # start all three; background processes + .logs/
pwsh scripts/start.ps1 stop    # stop everything (frees :8000/:8080/:3000)
```

**macOS / Linux / Git Bash:**
```bash
bash scripts/start.sh setup    # first time only
bash scripts/start.sh          # start all three; Ctrl-C stops everything
bash scripts/start.sh stop     # stop by port
```

Then open **http://localhost:3000** and register. The **first user to register becomes
ADMIN**; everyone after is a regular USER. See [docs/RUNNING.md](docs/RUNNING.md) for
ports, environment variables, logs, and troubleshooting.

### Manual start (if you prefer running each service yourself)

Start in this order. The control plane **requires** `EVOCODE_JWT_SECRET` (a ≥32-byte
secret) — it refuses to start without one (so a committed default key can't be used to
forge tokens). Windows venv paths shown; on macOS/Linux use `.venv/bin/...`.

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
   EVOCODE_JWT_SECRET="$(openssl rand -hex 32)" mvn spring-boot:run
   ```

3. **Frontend Console** (Port 3000)
   ```bash
   cd frontend
   pnpm install
   pnpm dev
   ```

### Verified End-to-End Check

All `/api/**` endpoints (except `/api/auth/**` and `/actuator/health`) require a JWT.
Register to obtain one, then use it as a Bearer token:

```bash
# 1) Register the first user (→ ADMIN) and capture the token
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"founder@example.com","password":"password123"}' \
  | python -c "import sys,json;print(json.load(sys.stdin)['token'])")

# 2) Submit an intent. The backend runs understand → plan → architect, then
#    INTERRUPTS before code generation and returns a real planned TaskGraph.
#    No files are written until you approve — twice.
curl -X POST http://localhost:8080/api/intents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"intent":"add a comments api and a product page","projectId":"shop"}'
# → {"runId":"<uuid>","status":"waiting_approval","gate":"plan",
#    "taskGraph":{"tasks":[...]},"changeSet":[],"message":"...awaiting plan approval (no files written)"}

# 3) Approve the plan → generates changeSet, stops at the diff gate (still no files on disk):
curl -X POST http://localhost:8080/api/runs/<runId>/approve -H "Authorization: Bearer $TOKEN"
# → {"status":"waiting_approval","gate":"diff","changeSet":[{"path":"evocode_generated/..."}], ...}

# 4) Approve the diff → applies to disk and completes:
curl -X POST http://localhost:8080/api/runs/<runId>/approve -H "Authorization: Bearer $TOKEN"
# → {"status":"completed","gate":null,"phase":"applied","appliedFiles":[...], ...}

curl http://localhost:8080/actuator/health   # → {"status":"UP"}  (public)
curl http://localhost:8000/health            # → {"status":"ok"}  (runtime)
```

For **live per-node progress**, use the SSE variants (`POST /api/runs/stream` and
`POST /api/runs/{id}/approve/stream`) — they stream `phase` frames per pipeline node
and a terminal `gate`/`done` frame. The frontend uses these by default and falls back
to the plain POST endpoints if streaming is unavailable.

#### Run history (persisted, owner-scoped)

The control plane persists every run, project, and session to an embedded H2 file
database (`control-plane/data/`), surviving restarts. List/get are scoped to the
current user (ADMIN sees all); non-owners get 404.

```bash
curl http://localhost:8080/api/runs -H "Authorization: Bearer $TOKEN"
# → [{"runId":"<uuid>","projectId":"shop","intent":"...","status":"completed", ...}]

curl http://localhost:8080/api/runs/<runId> -H "Authorization: Bearer $TOKEN"
# → full RunResult (taskGraph / changeSet / verification / review)
```


#### With a real project knowledge graph (optional `repoPath`)

Pass `repoPath` pointing at a React/Next.js repo. The `understand` step runs the
Node ts-morph extractor (`tools/ts-extractor/`, set up once via
`cd tools/ts-extractor && npm ci`) to build a real in-memory project graph; the
Planner then plans against the actual component tree, and `graphStats` reports
what was extracted:

```bash
curl -X POST http://localhost:8080/api/intents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"intent":"add a product page","projectId":"shop","repoPath":"E:/evocode/test/fixtures/next-app"}'
# → {"runId":"<uuid>","status":"waiting_approval","gate":"plan",
#    "taskGraph":{"tasks":[{"kind":"frontend",...},{"kind":"test",...}]},
#    "graphStats":{"fileCount":4,"componentCount":4,"importCount":2},
#    "changeSet":[],"message":"...awaiting plan approval (no files written)"}
# Approve twice (plan gate, then diff gate) to generate and apply against the repo.
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

The pipeline runs seven nodes: **understand → plan → architect → generate → verify →
review → apply**, with **two real approval gates** enforced by LangGraph interrupts:
it pauses before `generate` (the **plan gate**) and before `apply` (the **diff gate**).
Nothing is written to disk until the user approves both — this is enforced in the
backend, not simulated in the UI.

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

### Security

The Spring Boot control plane is the auth boundary. **All `/api/**` endpoints require a
JWT** except `/api/auth/**` (register/login) and `/actuator/health`. Auth model:

- **JWT + BCrypt**: stateless HS256 tokens; passwords hashed with BCrypt. The signing
  key comes from `EVOCODE_JWT_SECRET` (≥32 bytes) — the service refuses to start without
  one, so no committed default key can be used to forge tokens. The one-command scripts
  generate and persist a per-machine secret in `.evocode.env` (git-ignored).
- **Ownership isolation (RBAC)**: every Project / Session / Run is owned by its creator.
  Lists are scoped to the current user; accessing another user's resource returns **404**
  (no existence leak). The first registered user is **ADMIN** (sees everything); the rest
  are **USER**.
- **Still localhost-oriented**: CORS allows only `http://localhost:3000`, the AI runtime
  (:8000) itself is unauthenticated and trusts the control plane, and the H2 file DB and
  in-memory LangGraph checkpoints are single-node. Harden these (network policy, runtime
  auth, durable checkpointer, secret rotation) before any non-local deployment. See
  [docs/RUNNING.md](docs/RUNNING.md) and `docs/architecture/deployment-architecture.md`.

The Planner uses a deterministic stub LLM by default (no credentials needed). Set
`OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL` / `OPENAI_MODEL`) to switch the
planning node to a real prompt-driven OpenAI call.

## Cross-Layer Contracts

All layers adhere to the contract definitions in the `contracts/` directory. These schemas define:

- **IntentRequest**: Structure for user intents and project context
- **RunResult**: Full result of a run (status, gate, taskGraph, changeSet, verification, review)

See `contracts/README.md` for details on maintaining contract consistency across layers.

## Contributing

When modifying contracts or adding features:

1. Update the contract if needed in `contracts/`
2. Synchronize changes to all affected layers
3. Test cross-layer integration
4. Document changes in relevant layer READMEs

## License

EvoCode is part of the agent-driven engineering platform.
