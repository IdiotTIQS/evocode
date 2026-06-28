# Contracts

This directory is the single source of truth for cross-layer contracts.

## Intent Contract

The `intent.schema.json` file defines every cross-layer schema used by the EvoCode platform. The full set of definitions is:

- **IntentRequest**: A user intent — required `intent` text and `projectId`, with an optional `repoPath`. This is the request payload that starts a run.
- **ProjectGraphStats**: Summary of the knowledge graph built during the understand phase — file / component / import counts, cache-hit flag, graph version id, and max impact count.
- **EngineeringTask**: A single discrete task with `id`, `title`, `kind` (`frontend` / `backend` / `test` / `generic`), and `description`.
- **TaskGraph**: An ordered collection of `EngineeringTask` items produced by the planner.
- **ChangeFile**: One generated file — its `path` and full `content`.
- **Diagnostic**: A single verification diagnostic — `file`, optional `line`, numeric `code`, and `message`.
- **VerificationResult**: Outcome of the verify phase — whether it ran (`checked`), whether it `passed`, the `diagnosticCount`, and the list of `diagnostics`.
- **ReviewFinding**: A single review finding — `severity` (`critical` / `major` / `minor` / `suggestion`), `filePath`, `message`, and an optional `suggestedFix`.
- **ReviewOutput**: The review agent's result — a `verdict` (`approve` / `request_changes` / `block`), the list of `findings`, and a `summary`.
- **RunResult**: The top-level response for a run — `runId`, `status`, `phase`, `taskGraph`, `message`, plus optional `graphStats`, `changeSet`, `appliedFiles`, `verification`, and `review`.

> 中文说明：以上是 `intent.schema.json` 中真实存在的全部定义。`RunResult` 是流水线的顶层返回对象，内嵌了 `TaskGraph`、`ProjectGraphStats`、`ChangeFile`、`VerificationResult`、`ReviewOutput` 等子结构，对应 understand→plan→architect→generate→verify→review 各阶段的产物。

## Four-Layer Mirror（四层镜像）

This schema is the **single source of truth**. Each definition is mirrored across four layers and the field names are **camelCase** in every layer (Python uses snake_case internally with camelCase aliases):

**JSON Schema ↔ Pydantic ↔ Java record ↔ TypeScript interface**

Any changes to the contract definitions in this directory **must be synchronized** to the following mirror locations:

- **JSON Schema** (source of truth): `contracts/intent.schema.json`
- **Frontend** (TS interface): `frontend/src/types/intent.ts`
- **Control Plane** (Java record): `control-plane/.../dto/`
- **AI Runtime** (Pydantic model): `ai-runtime/src/evocode_runtime/models.py`

> 中文说明：四层镜像指同一份契约在 JSON Schema、Pydantic、Java record、TS interface 四处保持一致，字段统一为 camelCase（Python 内部用 snake_case，通过别名映射为 camelCase）。修改任何一处都必须同步其余三处。

## Update Process

When modifying any contract:

1. Update the schema in `intent.schema.json`
2. Synchronize all three mirror locations
3. Run validation tests to ensure consistency across layers
4. Update documentation as needed

This ensures all layers maintain a consistent understanding of the request/response contracts.
