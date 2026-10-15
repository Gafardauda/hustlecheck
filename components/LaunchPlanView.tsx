"use client";

import { useState } from "react";
import type { HustleReport } from "@/lib/report";
import { Card, CardTitle, KindBadge } from "./ui";

export default function LaunchPlanView({ report }: { report: HustleReport }) {
  const { plan } = report;
  const [copied, setCopied] = useState(false);
  const weeks = [...new Set(plan.checklist.map((c) => c.week))];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-lime">Your launch plan</p>
            <h2 className="mt-2 text-xl font-black sm:text-2xl">{plan.headline}</h2>
          </div>
          <button
            onClick={copyLink}
            className="shrink-0 rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:border-lime"
          >
            {copied ? "Link copied ✓" : "Copy share link"}
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle hint="Ranked by Qloo heatmap affinity.">Where to launch</CardTitle>
        <ol className="space-y-4">
          {plan.where.map((w, i) => (
            <li key={w.neighbourhood} className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-black text-ink">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold">{w.neighbourhood}</p>
                <p className="text-sm text-muted">{w.why}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <Card>
        <CardTitle hint="Highest-affinity partners from Qloo, one of each kind.">Who to collab with</CardTitle>
        <ul className="space-y-4">
          {plan.collabs.map((c) => (
            <li key={c.name}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{c.name}</span>
                <KindBadge kind={c.kind} />
              </div>
              <p className="mt-0.5 text-sm text-muted">{c.idea}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle>Name ideas</CardTitle>
        <div className="flex flex-wrap gap-2">
          {plan.names.map((n) => (
            <span key={n} className="rounded-xl border border-violet bg-panel-2 px-3 py-2 font-bold">
              {n}
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <CardTitle>First-month checklist</CardTitle>
        <div className="space-y-4">
          {weeks.map((week) => (
            <div key={week}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-widest text-faint">Week {week}</p>
              <ul className="space-y-2">
                {plan.checklist
                  .filter((c) => c.week === week)
                  .map((c) => (
                    <li key={c.task}>
                      <label className="flex cursor-pointer gap-3 text-sm">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-lime" />
                        <span>{c.task}</span>
                      </label>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
