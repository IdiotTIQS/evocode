// 镜像 contracts/intent.schema.json
export interface IntentRequest {
  intent: string;
  projectId: string;
}

export interface RunAcknowledgement {
  runId: string;
  status: "accepted" | "rejected";
  message: string;
}
