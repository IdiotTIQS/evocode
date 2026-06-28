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
  maxImpactCount?: number;
}

export interface ChangeFile {
  path: string;
  content: string;
}

export interface Diagnostic {
  file: string;
  line: number | null;
  code: number;
  message: string;
}

export interface VerificationResult {
  checked: boolean;
  passed: boolean;
  diagnosticCount: number;
  diagnostics: Diagnostic[];
}

export interface ReviewFinding {
  severity: "critical" | "major" | "minor" | "suggestion";
  filePath: string;
  message: string;
  suggestedFix?: string | null;
}

export interface ReviewOutput {
  verdict: "approve" | "request_changes" | "block";
  findings: ReviewFinding[];
  summary: string;
}

export interface RunResult {
  runId: string;
  // waiting_approval：后端已在某审批门前真实中断（plan/diff），等待批准后才继续。
  status: "waiting_approval" | "completed" | "failed";
  // 当 status === waiting_approval 时指明卡在哪个门；其余为 null/缺省。
  gate?: "plan" | "diff" | null;
  phase: string;
  taskGraph: TaskGraph;
  graphStats?: ProjectGraphStats;
  changeSet?: ChangeFile[];
  appliedFiles?: string[];
  verification?: VerificationResult;
  review?: ReviewOutput;
  message: string;
}

export interface RunSummary {
  runId: string;
  projectId: string;
  intent: string;
  status: string;
  phase: string;
  message: string;
  createdAt: string; // ISO-8601
}
