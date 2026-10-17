"use client";

import Link from "next/link";
import { useState } from "react";
import { audience, type HustleReport } from "@/lib/report";
import LaunchPlanView from "./LaunchPlanView";
import Scorecard from "./Scorecard";
import TrustPanel from "./TrustPanel";

const TABS = ["Scorecard", "Launch plan", "Why trust this"] as const;
type Tab = (typeof TABS)[number];
/** URL hash for each tab, so a link can open straight to e.g. the launch plan. */
const TAB_HASH: Record<Tab, string> = { Scorecard: "", "Launch plan": "#plan", "Why trust this": "#trust" };

export function tabFromHash(): Tab {
  if (typeof window === "undefined") return "Scorecard";
  return TABS.find((t) => TAB_HASH[t] && TAB_HASH[t] === window.location.hash) ?? "Scorecard";
}

export function ReportHeader({
  idea,
  city,
  budget,
  audienceLabel,
  badges,
}: {
  idea: string;
  city: string;
  budget?: string;
  audienceLabel?: string;
  badges?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <Link href="/" className="text-sm text-muted hover:text-fg">
        ← New check
      </Link>
      <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">{idea}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{city}</span>
        {audienceLabel && <span>· {audienceLabel}</span>}
        {budget && <span>· Budget {budget}</span>}
        {badges}
      </p>
    </div>
  );
}

const pill = "rounded-full border border-violet-soft/50 px-2 py-0.5 text-xs text-violet-soft";

/** Header plus the Scorecard / Launch plan / Why trust this tabs for a finished report. */
export default function ReportView({ report, shared = false }: { report: HustleReport; shared?: boolean }) {
  const [tab, setTab] = useState<Tab>(tabFromHash);

  function selectTab(t: Tab) {
    setTab(t);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${TAB_HASH[t]}`);
  }

  const checkedOn = new Date(report.generatedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div>
      <ReportHeader
        idea={report.input.idea}
        city={report.input.city}
        budget={report.input.budget}
        audienceLabel={audience(report.input.audience).long}
        badges={
          <>
            {shared && <span className={pill}>Shared report · checked {checkedOn}</span>}
            {report.usedMockData && <span className={pill}>Preview · sample Qloo data</span>}
          </>
        }
      />
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
    </div>
  );
}
