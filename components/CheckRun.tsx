"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { QlooCallRecord } from "@/lib/qloo";
import { STEP_KEYS, stepTitle, type AgentStep, type CheckEvent, type HustleInput, type HustleReport } from "@/lib/report";
import AgentTrace from "./AgentTrace";
import LaunchPlanView from "./LaunchPlanView";
import Scorecard from "./Scorecard";
import TrustPanel from "./TrustPanel";

/** Minimum gap between revealed steps, so fast (cached) runs still read like an agent at work. */
const STEP_MS = 600;
const TABS = ["Scorecard", "Launch plan", "Why trust this"] as const;
type Tab = (typeof TABS)[number];
/** URL hash for each tab, so a link can open straight to e.g. the launch plan. */
const TAB_HASH: Record<Tab, string> = { Scorecard: "", "Launch plan": "#plan", "Why trust this": "#trust" };

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "Scorecard";
  return TABS.find((t) => TAB_HASH[t] && TAB_HASH[t] === window.location.hash) ?? "Scorecard";
}

export default function CheckRun({ input }: { input: HustleInput }) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [calls, setCalls] = useState<QlooCallRecord[]>([]);
  const [report, setReport] = useState<HustleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  // A shared link that targets a tab skips the replay and opens results directly.
  const [skipReplay, setSkipReplay] = useState(() => tabFromHash() !== "Scorecard");

  function selectTab(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${TAB_HASH[t]}`);
  }

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
      else if (event.type === "report") setReport(event.report);
      else setError(event.message);
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

  const visible = steps.slice(0, shown);
  const done = report !== null && (skipReplay || shown >= steps.length);
  const titles = STEP_KEYS.map((key) => ({ key, title: stepTitle(key, input.city) }));

  return (
    <div>
      <div className="mb-8">
        <Link href="/" className="text-sm text-muted hover:text-fg">
          ← New check
        </Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">{input.idea}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{input.city}</span>
          {input.budget && <span>· Budget {input.budget}</span>}
          {report?.usedMockData && (
            <span className="rounded-full border border-violet-soft/50 px-2 py-0.5 text-xs text-violet-soft">
              Preview · sample Qloo data
            </span>
          )}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-2xl border border-red-400/50 bg-panel p-6">
          <p className="font-semibold">The agent hit a problem.</p>
          <p className="mt-1 text-sm text-muted">{error}</p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-lime">
            Try again
          </Link>
        </div>
      ) : !done ? (
        <div className="max-w-2xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold">Agent at work</h2>
            {report && (
              <button onClick={() => setSkipReplay(true)} className="text-sm text-muted hover:text-fg">
                Skip →
              </button>
            )}
          </div>
          <AgentTrace titles={titles} steps={visible} calls={calls} />
          <p className="mt-4 text-xs text-faint">
            Live Qloo and AI calls can take up to a minute. Every step above is a real request.
          </p>
        </div>
      ) : (
        <>
          <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1">
            {TABS.map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => selectTab(t)}
                className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition ${
                  tab === t ? "bg-lime text-ink" : "text-muted hover:text-fg"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === "Scorecard" && <Scorecard report={report} />}
          {tab === "Launch plan" && <LaunchPlanView report={report} />}
          {tab === "Why trust this" && <TrustPanel report={report} />}
        </>
      )}
    </div>
  );
}
