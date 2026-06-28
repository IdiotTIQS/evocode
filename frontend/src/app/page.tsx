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
          {result?.graphStats && (
            <p>项目图：{result.graphStats.fileCount} 文件 / {result.graphStats.componentCount} 组件 / {result.graphStats.importCount} import
              {result.graphStats.cacheHit ? "（缓存命中）" : "（新抽取）"}
              {result.graphStats.graphVersionId != null ? ` v${result.graphStats.graphVersionId}` : ""}
              {" · 最大影响面 "}{result.graphStats.maxImpactCount ?? 0}{" 文件"}
            </p>
          )}
          <ul>
            {result.taskGraph.tasks.map((t) => (
              <li key={t.id}>
                <strong>[{t.kind}]</strong> {t.title} — {t.description}
              </li>
            ))}
          </ul>
          {result.changeSet && result.changeSet.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>生成的文件 ({result.changeSet.length})</h3>
              {result.appliedFiles && result.appliedFiles.length > 0 && (
                <p style={{ color: "green" }}>✓ 已写入目标仓库 {result.appliedFiles.length} 个文件</p>
              )}
              {result.changeSet.map((f) => (
                <details key={f.path} style={{ marginBottom: 8 }}>
                  <summary><code>{f.path}</code></summary>
                  <pre style={{ background: "#f5f5f5", padding: 12, overflow: "auto", fontSize: 12 }}>{f.content}</pre>
                </details>
              ))}
            </div>
          )}
          {result.verification?.checked && (
            <p style={{ marginTop: 16 }}>
              验证：{result.verification.passed
                ? "✓ 类型检查通过"
                : `✗ ${result.verification.diagnosticCount} 个问题`}
            </p>
          )}
          {result.review && (
            <div style={{ marginTop: 16 }}>
              <h3>
                审查裁定：{result.review.verdict === "approve"
                  ? "✓ 通过 (approve)"
                  : result.review.verdict === "request_changes"
                  ? "⚠ 需修改 (request_changes)"
                  : "✗ 阻断 (block)"}
              </h3>
              <p>{result.review.summary}</p>
              {result.review.findings.length > 0 && (
                <ul>
                  {result.review.findings.map((f, i) => (
                    <li key={i}>
                      <strong>[{f.severity}]</strong> <code>{f.filePath}</code> — {f.message}
                      {f.suggestedFix ? <em> 建议：{f.suggestedFix}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
