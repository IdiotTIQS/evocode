// 镜像 contracts/intent.schema.json
export interface IntentRequest {
  intent: string;
  projectId: string;
}

export type TaskKind = "frontend" | "backend" | "test" | "generic";

export interface EngineeringTask {
  id: string;
  title: string;
  kind: TaskKind;
  description: string;
}

export interface TaskGraph {
  tasks: EngineeringTask[];
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed";
  phase: string;
  taskGraph: TaskGraph;
  message: string;
}
