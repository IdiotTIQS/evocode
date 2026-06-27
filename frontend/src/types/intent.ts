// 镜像 contracts/intent.schema.json
export interface IntentRequest {
  intent: string;
  projectId: string;
  repoPath?: string;
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

export interface ProjectGraphStats {
  fileCount: number;
  componentCount: number;
  importCount: number;
  cacheHit?: boolean;
  graphVersionId?: number | null;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed";
  phase: string;
  taskGraph: TaskGraph;
  graphStats?: ProjectGraphStats;
  message: string;
}
