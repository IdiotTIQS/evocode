# Front-to-Back Wiring

How a request actually flows through EvoCode today: every layer, the auth header, the
two approval gates, the SSE frames, persistence, and ownership. This is the **as-built**
wiring (verified end-to-end), not a target design.

```
Browser (Next.js :3000)
   │  Authorization: Bearer <JWT>   (except /api/auth/**)
   ▼
Control Plane (Spring Boot :8080)   ── auth boundary, ownership, persistence (H2)
   │  POST /runs[/…/resume][/stream]   (no auth; trusted localhost link)
   ▼
AI Runtime (FastAPI :8000)          ── LangGraph pipeline + approval-gate checkpoints (SQLite)
```

The frontend **never** calls the runtime directly. The control plane is the only
authenticated surface; the runtime trusts it over localhost.

---

## 1. Authentication

| Step | Call | Notes |
|---|---|---|
| Register | `POST /api/auth/register {email,password}` | First user → `ADMIN`, rest → `USER`. Returns `{token, user}`. |
| Login | `POST /api/auth/login {email,password}` | Returns `{token, user}`. |
| Hydrate | `GET /api/auth/me` (Bearer) | Frontend `AuthContext` calls this on mount to restore the session. |

Frontend: `AuthContext` stores the JWT in `localStorage`, `authFetch` attaches
`Authorization: Bearer <token>` to every API call, and a global 401 handler logs out and
redirects to `/login`. The `(workspace)` route group is wrapped by `RequireAuth`.

Backend: `JwtAuthFilter` validates the HS256 token (signature + expiry) and populates the
`SecurityContext` with `AuthPrincipal(userId, email, role)`. `SecurityConfig` permits
`/api/auth/**` and `/actuator/health`; everything else requires authentication and returns
**401** otherwise.

---

## 2. Submit intent → plan gate (no files written)

```
Frontend useExecution.submitIntent(text)
  └─ POST /api/runs/stream         (SSE; falls back to POST /api/intents)
       Control Plane RunStreamController / IntentController
         └─ PythonRuntimeClient → POST /runs(/stream)   {intent, projectId, repoPath?, sessionId?}
              AI Runtime RunService.plan_stream / plan
                └─ graph.stream(…, interrupt_before=["generate","apply"])
                     understand → plan → architect → ⏸ (stops before generate)
```

The runtime runs three nodes then **interrupts before `generate`**. It returns
`status="waiting_approval"`, `gate="plan"`, a real `taskGraph`, and an **empty
`changeSet`** — nothing has touched disk. The control plane persists the run
(`ownerId` = caller, `sessionId` from the request) and streams/returns the result.

SSE frames (per node, then terminal):
```
data: {"type":"run","runId":"…"}
data: {"type":"phase","node":"understand","label":"正在理解项目结构与上下文"}
data: {"type":"phase","node":"plan","label":"正在规划工程任务"}
data: {"type":"phase","node":"architect","label":"正在设计架构与文件落点"}
data: {"type":"gate","result":{…,"status":"waiting_approval","gate":"plan"}}
```
The control plane proxies these frames verbatim via `SseEmitter` (persisting the terminal
frame before forwarding, so a disconnect can't desync the DB). The frontend parses both
`data: {…}` and `data:{…}` prefixes.

---

## 3. Approve plan → diff gate (still no files written)

```
useExecution.approvePlan()
  └─ POST /api/runs/{id}/approve/stream      (SSE; falls back to /approve)
       Control Plane → PythonRuntimeClient → POST /runs/{id}/resume(/stream)
         AI Runtime RunService.resume_stream → graph.invoke(None, …)
           generate → verify → review → ⏸ (stops before apply)
```

The runtime resumes from the checkpoint, generates the `changeSet`, runs verify + review,
then **interrupts before `apply`**. Returns `gate="diff"` with the real `changeSet` — but
`apply_node` has not run, so **still nothing on disk**. The control plane `update`s the
persisted run.

---

## 4. Approve diff → apply + complete (files written here, and only here)

```
useExecution.approveDiff()
  └─ POST /api/runs/{id}/approve/stream
       … RunService.resume_stream → graph.invoke(None, …)
         apply  → writes evocode_generated/ → END
```

Returns `status="completed"`, `phase="applied"`, `appliedFiles=[…]`. This is the single
node in the whole pipeline that writes to disk, and it runs only after the second human
approval — enforcing the product constraint *"never execute code changes immediately after
intent submission."*

`reject()` on either gate just resets the client; because the backend never wrote anything
before approval, there's nothing to roll back.

---

## 5. Persistence & durability

| What | Where | Survives runtime restart? |
|---|---|---|
| Users / Projects / Sessions / Messages / Runs | Control Plane — H2 file DB (`control-plane/data/`) | yes (control-plane DB) |
| Approval-gate checkpoints (paused runs) | AI Runtime — SQLite via LangGraph `SqliteSaver` (`ai-runtime/data/checkpoints.db`, keyed by `thread_id=runId`) | **yes** — a run paused at a gate can be resumed after restarting the runtime |
| Knowledge-graph cache | AI Runtime — SQLite (`ai-runtime/data/pkg.db`) | yes |

Both data dirs are git-ignored. Override paths via `EVOCODE_CHECKPOINT_DB` and
`EVOCODE_PKG_DB`.

---

## 6. Ownership & scoping

Every Project / Session / Run carries an `ownerId`. List endpoints return only the
caller's resources; accessing another user's resource returns **404** (no existence leak).
`ADMIN` (the first registered user) sees everything. Runs additionally carry `sessionId`,
so `GET /api/runs?sessionId=<id>` returns a session's run history (still owner-scoped) —
this drives the "本会话运行历史" panel in the session workspace.

---

## 7. Endpoint map (as-built)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` `/login` | public | obtain JWT |
| GET | `/api/auth/me` | Bearer | hydrate current user |
| GET/POST/PATCH/DELETE | `/api/projects[/{id}]` | Bearer | project CRUD (owner-scoped) |
| GET/POST | `/api/sessions[?projectId=]` | Bearer | sessions; nested `…/{id}/messages` |
| POST | `/api/intents` | Bearer | submit intent → plan gate |
| POST | `/api/runs/stream` | Bearer | submit intent (SSE per-node) |
| POST | `/api/runs/{id}/approve` `/approve/stream` | Bearer | approve current gate (POST or SSE) |
| GET | `/api/runs[?limit=&sessionId=]` `/api/runs/{id}` | Bearer | run history / detail (owner-scoped) |
| GET | `/actuator/health` (`:8080`), `/health` (`:8000`) | public | liveness |

> The runtime endpoints (`/runs`, `/runs/{id}/resume`, `…/stream`) are internal — called
> only by the control plane, unauthenticated, localhost-trusted.

See [RUNNING.md](RUNNING.md) for how to start the stack and the auth-first quickstart.
