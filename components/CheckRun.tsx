"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { HustleInput, HustleReport } from "@/lib/report";
import AgentTrace from "./AgentTrace";
import LaunchPlanView from "./LaunchPlanView";
import Scorecard from "./Scorecard";
import TrustPanel from "./TrustPanel";

const STEP_MS = 900;
const TABS = ["Scorecard", "Launch plan", "Why trust this"] as const;
type Tab = (typeof TABS)[number];
/** URL hash for each tab, so a link can open straight to e.g. the launch plan. */
const TAB_HASH: Record<Tab, string> = { Scorecard: "", "Launch plan": "#plan", "Why trust this": "#trust" };

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "Scorecard";
  return TABS.find((t) => TAB_HASH[t] && TAB_HASH[t] === window.location.hash) ?? "Scorecard";
}

export default function CheckRun({ input }: { input: HustleInput }) {
  const [report, setReport] = useState<HustleReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(0);
  const [tab, setTab] = useState<Tab>(tabFromHash);
  // A shared link that targets a tab skips the replay and opens results directly.
  const [skipReplay] = useState(() => tabFromHash() !== "Scorecard");

  function selectTab(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${TAB_HASH[t]}`);
  }

  const titles = [
    "Understanding your idea",
    "Measuring Gen Z appetite",
    `Mapping demand across ${input.city}`,
    "Finding collab partners",
    "Calculating your PulseScore",
  ];

  useEffect(() => {
    let cancelled = false;
    fetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
        if (!cancelled) setReport(body as HustleReport);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [input]);

  // Reveal one finished step at a time so the trace reads like the agent at work.
  useEffect(() => {
    if (!report || revealed >= titles.length) return;
    const t = setTimeout(() => setRevealed((r) => r + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [report, revealed, titles.length]);

  const done = report !== null && (skipReplay || revealed >= titles.length);

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
              <button onClick={() => setRevealed(titles.length)} className="text-sm text-muted hover:text-fg">
                Skip →
              </button>
            )}
          </div>
          <AgentTrace titles={titles} steps={report?.steps} calls={report?.calls} revealed={revealed} />
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
