"use client";

import { useState } from "react";
import { submitIntent } from "@/lib/api";
import type { RunAcknowledgement } from "@/types/intent";

export default function Home() {
  const [intent, setIntent] = useState("");
  const [projectId, setProjectId] = useState("demo");
  const [result, setResult] = useState<RunAcknowledgement | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setResult(await submitIntent({ intent, projectId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>EvoCode Console</h1>
      <form onSubmit={onSubmit}>
        <input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="projectId" />
        <textarea value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="Describe your intent..." rows={4} style={{ width: "100%" }} />
        <button type="submit" disabled={!intent}>Submit Intent</button>
      </form>
      {result && <pre>{JSON.stringify(result, null, 2)}</pre>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </main>
  );
}
