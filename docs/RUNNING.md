# Running EvoCode

How to run the full stack locally: the one-command scripts, what each service is, ports,
environment variables, health checks, the auth flow, and troubleshooting.

> Scope: **local development on a single machine**, three application processes. Containers,
> PostgreSQL/Redis, HTTPS, and horizontal scaling are target designs only — see
> `docs/architecture/deployment-architecture.md`.

---

## The three services

| Service | Port | Tech | Health |
|---|---|---|---|
| Frontend Console | 3000 | Next.js 15 / React 19 / TypeScript | `GET http://localhost:3000` |
| Control Plane | 8080 | Spring Boot 3.3 / Java 21 | `GET http://localhost:8080/actuator/health` → `{"status":"UP"}` |
| AI Runtime | 8000 | Python 3.11 / FastAPI / LangGraph | `GET http://localhost:8000/health` → `{"status":"ok"}` |

Data flow: **Frontend → Control Plane → AI Runtime**. The frontend never calls the
runtime directly. The control plane is the auth boundary and persists state to an embedded
H2 file database (`control-plane/data/`).

Startup order matters: runtime first (control plane proxies to it), then control plane,
then frontend. The one-command scripts enforce this with health-check gating.

---

## Prerequisites

- **Python 3.11** (runtime is pinned to 3.11; a venv is created under `ai-runtime/.venv`)
- **JDK 21**
- **Maven 3.9** (`mvn` on PATH)
- **Node.js 22** + **pnpm 10** (`pnpm` on PATH)
- **Git**
- Optional: Node-based `ts-extractor` (set up by `setup`) — only needed for `repoPath`
  knowledge-graph analysis; the core flow works without it.

---

## One-command start

**Windows (PowerShell):**
```powershell
pwsh scripts/start.ps1 setup   # first time only — installs venv / npm / pnpm deps
pwsh scripts/start.ps1         # start all three (background; logs in .logs\)
pwsh scripts/start.ps1 stop    # stop everything (frees :8000 / :8080 / :3000)
```

**macOS / Linux / Git Bash:**
```bash
bash scripts/start.sh setup    # first time only
bash scripts/start.sh          # start all three; Ctrl-C stops everything
bash scripts/start.sh stop     # stop by port
```

What `start` does, in order:
1. Ensures a JWT secret exists (generates one into `.evocode.env` on first run, reuses it after).
2. Starts the AI Runtime, waits for `/health`.
3. Starts the Control Plane with `EVOCODE_JWT_SECRET` injected, waits for `/actuator/health`.
4. Starts the Frontend, waits for it to serve.
5. Prints the URLs. Logs stream to `.logs/` (git-ignored).

> `scripts/dev.sh` is a simpler legacy launcher (no health gating). Prefer `start.sh`.

---

## First use

Open **http://localhost:3000**. You'll be redirected to `/login` (the workspace is
auth-guarded). Register an account:

- The **first user to register becomes ADMIN** (sees all data).
- Every subsequent user is a **USER** (sees only their own projects / sessions / runs).

After logging in you can create a project, open a session, submit an intent, and walk the
two approval gates (plan → diff) to generate and apply code.

---

## Environment variables

| Variable | Service | Default | Notes |
|---|---|---|---|
| `EVOCODE_JWT_SECRET` | Control Plane | *(none — required)* | ≥32-byte signing key. Control plane **refuses to start** without it. Scripts auto-generate into `.evocode.env`. |
| `evocode.jwt.ttl-hours` | Control Plane | `24` | Token lifetime. |
| `python.runtime.base-url` | Control Plane | `http://localhost:8000` | Where the runtime lives. |
| `OPENAI_API_KEY` | AI Runtime | *(unset)* | If set, the planner uses a real OpenAI call instead of the deterministic stub. Optional: `OPENAI_BASE_URL`, `OPENAI_MODEL`. |
| `EVOCODE_PKG_DB` | AI Runtime | `data/pkg.db` | SQLite path for the knowledge-graph cache. |
| `NEXT_PUBLIC_CONTROL_PLANE_URL` | Frontend | `http://localhost:8080` | Control-plane base URL the browser calls. |

`.evocode.env` (git-ignored) holds the generated `EVOCODE_JWT_SECRET`. Delete it to rotate
the key — all existing tokens become invalid and users must log in again.

---

## Auth & API quick reference

All `/api/**` require `Authorization: Bearer <token>` except `/api/auth/**` and
`/actuator/health`.

```bash
# Register (first user → ADMIN) — returns { token, user }
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'

# Login — returns { token, user }
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'

# Use the token
curl http://localhost:8080/api/projects -H "Authorization: Bearer <token>"
```

Intent → two-gate flow (no files on disk until both approvals):
`POST /api/intents` → `waiting_approval/plan` →
`POST /api/runs/{id}/approve` → `waiting_approval/diff` →
`POST /api/runs/{id}/approve` → `completed`.
Streaming variants (`/api/runs/stream`, `/api/runs/{id}/approve/stream`) emit per-node SSE
progress.

---

## Logs

The scripts write per-service logs to `.logs/` (git-ignored):
- `.logs/ai-runtime.log`
- `.logs/control-plane.log`
- `.logs/frontend.log`

(PowerShell also writes `*.err.log` for stderr.)

---

## Troubleshooting

**Control plane exits immediately with `evocode.jwt.secret 未配置`.**
You ran it manually without the secret. Use a script, or set it:
`EVOCODE_JWT_SECRET="$(openssl rand -hex 32)" mvn spring-boot:run`.

**Port already in use (8000 / 8080 / 3000).**
A previous run didn't shut down. Run `scripts/start.* stop`, or kill the listener:
Windows `Get-NetTCPConnection -LocalPort 8080 | Stop-Process -Id { $_.OwningProcess }`,
*nix `lsof -ti :8080 | xargs kill`.

**Login works but every API call returns 401.**
The browser token is stale or the JWT secret changed (e.g. `.evocode.env` was deleted /
regenerated). Log out and back in; the frontend clears the token and redirects to `/login`
on any 401.

**A user can't see projects another user created.**
Expected — ownership isolation. Each USER sees only their own data; only ADMIN (the first
registered user) sees everything.

**Generated files don't appear after submitting an intent.**
Files are written only after the **second** approval (the diff gate). Approve the plan,
then approve the diff. Also note: `repoPath` must point to a directory the runtime process
can access; without `repoPath` a `changeSet` is still produced but nothing is applied to a
target repo.

**Do pending runs survive a runtime restart?**
Yes. LangGraph approval checkpoints are persisted to SQLite (`ai-runtime/data/checkpoints.db`
via `SqliteSaver`, keyed by `thread_id=runId`), so a run paused at the plan or diff gate can
be resumed after restarting the AI runtime. Override the path with `EVOCODE_CHECKPOINT_DB`
(set to `:memory:` for an ephemeral, non-persistent checkpointer). Completed-run history and
Project/Session/Message data persist separately in the control-plane H2 DB.

**`mvn` / `pnpm` / `python` not found.**
Check the Prerequisites above are installed and on PATH. `setup` must finish once before
`start`.
