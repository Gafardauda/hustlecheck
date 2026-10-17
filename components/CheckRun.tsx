"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { QlooCallRecord } from "@/lib/qloo";
import { audience, STEP_KEYS, stepTitle, type AgentStep, type CheckEvent, type HustleInput, type HustleReport } from "@/lib/report";
import AgentTrace from "./AgentTrace";
import ReportView, { ReportHeader, tabFromHash } from "./ReportView";

/** Minimum gap between revealed steps, so fast (cached) runs still read like an agent at work. */
const STEP_MS = 600;

export default function CheckRun({ input }: { input: HustleInput }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [calls, setCalls] = useState<QlooCallRecord[]>([]);
  const [report, setReport] = useState<HustleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  // A link that targets a tab skips the replay and opens results directly.
  const [skipReplay, setSkipReplay] = useState(() => tabFromHash() !== "Scorecard");

  useEffect(() => {
    const controller = new AbortController();
    const handle = (event: CheckEvent) => {
      if (event.type === "step")
        setSteps((prev) => {
          const i = prev.findIndex((s) => s.key === event.step.key);
          return i >= 0 ? prev.map((s, j) => (j === i ? event.step : s)) : [...prev, event.step];
        });
      else if (event.type === "call")
        setCalls((prev) => {
          const next = [...prev];
          next[event.index] = event.call;
          return next;
        });
      else if (event.type === "report") {
        setReport(event.report);
        // Saved reports get a permanent address; "Copy share link" then shares this exact result.
        if (event.report.id) {
          window.history.replaceState(null, "", `/r/${event.report.id}${window.location.hash}`);
        }
      } else setError(event.message);
    };

    (async () => {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong.");
      }
      // Newline-delimited JSON: parse each complete line as it arrives.
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line) as CheckEvent);
      }
    })().catch((err: Error) => {
      if (err.name !== "AbortError") setError(err.message || "Connection lost. Please try again.");
    });
    return () => controller.abort();
  }, [input]);

  // Reveal finished steps one at a time.
  useEffect(() => {
    if (shown >= steps.length) return;
    const t = setTimeout(() => setShown((s) => s + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [shown, steps.length]);

  const done = report !== null && (skipReplay || shown >= steps.length);
  if (done) return <ReportView report={report} />;

  const titles = STEP_KEYS.map((key) => ({ key, title: stepTitle(key, input.city) }));
  return (
    <div>
      <ReportHeader
        idea={input.idea}
        city={input.city}
        budget={input.budget}
        audienceLabel={audience(input.audience).long}
      />
      {error ? (
        <div role="alert" className="rounded-2xl border border-red-400/50 bg-panel p-6">
          <p className="font-semibold">The agent hit a problem.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-lime">
            Try again
          </Link>
        </div>
      ) : (
        <div className="max-w-2xl">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold">Reading the vibe…</h2>
            {report && (
              <button onClick={() => setSkipReplay(true)} className="text-sm text-muted hover:text-fg">
                Skip →
              </button>
            )}
          </div>
          <p className="mb-4 text-sm text-muted">Checking real taste data for your idea. This takes a few seconds.</p>
          <AgentTrace titles={titles} steps={steps.slice(0, shown)} calls={calls} />
        </div>
      )}
    </div>
  );
}
