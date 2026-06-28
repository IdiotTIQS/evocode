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
  status: "completed" | "failed";
  phase: string;
  taskGraph: TaskGraph;
  graphStats?: ProjectGraphStats;
  changeSet?: ChangeFile[];
  appliedFiles?: string[];
  verification?: VerificationResult;
  review?: ReviewOutput;
  message: string;
}
