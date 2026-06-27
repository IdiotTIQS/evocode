"use client";

import { useState } from "react";
import { submitIntent } from "@/lib/api";
import type { RunResult } from "@/types/intent";

export default function Home() {
  const [intent, setIntent] = useState("");
  const [projectId, setProjectId] = useState("demo");
  const [repoPath, setRepoPath] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResult(await submitIntent({ intent, projectId, repoPath: repoPath || undefined }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>EvoCode Console</h1>
      <form onSubmit={onSubmit}>
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="projectId" />
        <input value={repoPath} onChange={(e) => setRepoPath(e.target.value)} placeholder="目标仓库路径（可选）" style={{ width: "100%", marginTop: 8 }} />
        <textarea value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Describe your intent..." rows={4} style={{ width: "100%" }} />
        <button type="submit" disabled={!intent}>Submit Intent</button>
      </form>
      {result && (
        <section style={{ marginTop: 24 }}>
          <p>Run <code>{result.runId}</code> — {result.status} ({result.phase})</p>
          <p>{result.message}</p>
          {result.graphStats && (
            <p>项目图：{result.graphStats.fileCount} 文件 / {result.graphStats.componentCount} 组件 / {result.graphStats.importCount} import</p>
          )}
          <ul>
            {result.taskGraph.tasks.map((t) => (
              <li key={t.id}>
                <strong>[{t.kind}]</strong> {t.title} — {t.description}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
