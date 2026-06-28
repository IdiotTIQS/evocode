"use client";

import { useState } from "react";
import { submitIntent } from "@/lib/api";
import type { RunResult } from "@/types/intent";

export default function Console() {
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
    <main className="mx-auto max-w-2xl px-6 py-12">
      <a href="/" className="text-sm text-[var(--color-accent)] hover:underline">← 返回首页</a>
      <h1 className="mt-4 text-3xl display">EvoCode Console</h1>
      <p className="mt-2 text-[var(--color-muted)]">
        提交一个意图，流水线将 understand → plan → architect → generate → verify → review 一次跑完。
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          placeholder="projectId"
          className="w-full rounded-lg border border-[var(--color-border-soft)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        <input
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
          placeholder="目标仓库路径（可选）"
          className="w-full rounded-lg border border-[var(--color-border-soft)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Describe your intent..."
          rows={4}
          className="w-full rounded-lg border border-[var(--color-border-soft)] px-3 py-2 outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={!intent}
          className="rounded-lg bg-[var(--color-accent)] px-5 py-2.5 font-medium text-white transition hover:bg-[var(--color-accent-strong)] disabled:opacity-40"
        >
          Submit Intent
        </button>
      </form>
      {result && (
        <section className="mt-8 space-y-4">
          <p>
            Run <code className="rounded bg-[var(--color-surface-alt)] px-1.5 py-0.5 text-sm">{result.runId}</code> — {result.status} ({result.phase})
          </p>
          <p className="text-[var(--color-muted)]">{result.message}</p>
          {result?.graphStats && (
            <p className="text-sm text-[var(--color-muted)]">
              项目图：{result.graphStats.fileCount} 文件 / {result.graphStats.componentCount} 组件 / {result.graphStats.importCount} import
              {result.graphStats.cacheHit ? "（缓存命中）" : "（新抽取）"}
              {result.graphStats.graphVersionId != null ? ` v${result.graphStats.graphVersionId}` : ""}
              {" · 最大影响面 "}{result.graphStats.maxImpactCount ?? 0}{" 文件"}
            </p>
          )}
          <ul className="space-y-1">
            {result.taskGraph.tasks.map((t) => (
              <li key={t.id}>
                <strong>[{t.kind}]</strong> {t.title} — {t.description}
              </li>
            ))}
          </ul>
          {result.changeSet && result.changeSet.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-medium">生成的文件 ({result.changeSet.length})</h3>
              {result.appliedFiles && result.appliedFiles.length > 0 && (
                <p className="text-[var(--color-teal)]">✓ 已写入目标仓库 {result.appliedFiles.length} 个文件</p>
              )}
              {result.changeSet.map((f) => (
                <details key={f.path} className="rounded-lg border border-[var(--color-border-soft)] p-2">
                  <summary className="cursor-pointer"><code>{f.path}</code></summary>
                  <pre className="mt-2 overflow-auto rounded bg-[var(--color-surface-alt)] p-3 text-xs">{f.content}</pre>
                </details>
              ))}
            </div>
          )}
          {result.verification?.checked && (
            <p>
              验证：{result.verification.passed ? "✓ 类型检查通过" : `✗ ${result.verification.diagnosticCount} 个问题`}
            </p>
          )}
          {result.review && (
            <div className="space-y-2">
              <h3 className="font-medium">
                审查裁定：{result.review.verdict === "approve"
                  ? "✓ 通过 (approve)"
                  : result.review.verdict === "request_changes"
                  ? "⚠ 需修改 (request_changes)"
                  : "✗ 阻断 (block)"}
              </h3>
              <p className="text-[var(--color-muted)]">{result.review.summary}</p>
              {result.review.findings.length > 0 && (
                <ul className="space-y-1 text-sm">
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
      {error && <p className="mt-4 text-red-600">{error}</p>}
    </main>
  );
}
