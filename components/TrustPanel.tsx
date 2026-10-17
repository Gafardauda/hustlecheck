"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HustleReport } from "@/lib/report";
import { callTime, describeCall } from "./AgentTrace";
import { Card, CardTitle } from "./ui";

const QLOO = "var(--color-series-qloo)";
const LLM = "var(--color-series-llm)";

export default function TrustPanel({ report }: { report: HustleReport }) {
  const { rows, illustrative, generatedAt, ideas, cities, method } = report.benchmark;
  const liveCalls = report.calls.filter((c) => !c.mock).length;
  const ranAt = generatedAt
    ? new Date(generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="grid gap-5">
      <Card>
        <CardTitle>How this check was made</CardTitle>
        <ul className="space-y-2 text-sm text-muted">
          <li>
            {report.source === "agent" ? (
              <>
                A <span className="text-fg">Gemini agent</span> ({report.model}) chose the keywords, comparable brands
                and taste tags, then called Qloo. The PulseScore is calculated in code from Qloo&apos;s numbers, not by
                the AI.
              </>
            ) : (
              <>
                Keywords were <span className="text-fg">matched automatically</span> (no AI) and sent to Qloo. The
                PulseScore is calculated in code from Qloo&apos;s numbers.
              </>
            )}
          </li>
          <li>
            Qloo data:{" "}
            {report.usedMockData ? (
              <span className="text-fg">sample data (preview mode)</span>
            ) : (
              <span className="text-lime">live from Qloo&apos;s taste graph</span>
            )}
            .
          </li>
          {report.notes.map((n) => (
            <li key={n}>Note: {n}</li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardTitle hint="Share of answers that pass each check, HustlePulse (Qloo + AI) vs the same AI with no Qloo data.">
          Qloo vs LLM-only
        </CardTitle>
        {illustrative ? (
          <p className="mb-4 rounded-lg border border-violet-soft/40 bg-panel-2 px-3 py-2 text-xs text-violet-soft">
            Illustrative numbers. The real benchmark is coming before launch.
          </p>
        ) : (
          method && (
            <p className="mb-4 rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted">
              {method}
              {ideas && cities ? ` Measured on ${ideas} ideas across ${cities} cities` : ""}
              {ranAt ? ` on ${ranAt}` : ""}.
            </p>
          )
        )}
        <div className="mb-3 flex gap-5 text-sm">
          <LegendItem color={QLOO} label="With Qloo" />
          <LegendItem color={LLM} label="LLM only" />
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barGap={2}>
              <CartesianGrid horizontal={false} stroke="var(--color-line)" strokeOpacity={0.6} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fill: "var(--color-faint)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <YAxis
                type="category"
                dataKey="metric"
                width={150}
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: "var(--color-panel-2)" }}
                contentStyle={{
                  background: "var(--color-panel-2)",
                  border: "1px solid var(--color-line)",
                  borderRadius: 8,
                  color: "var(--color-fg)",
                }}
                formatter={(v) => `${v}%`}
              />
              <Bar dataKey="qloo" name="With Qloo" fill={QLOO} radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
                <LabelList dataKey="qloo" position="right" fill="var(--color-fg)" fontSize={11} formatter={(v) => `${v}%`} />
              </Bar>
              <Bar dataKey="llmOnly" name="LLM only" fill={LLM} radius={[0, 4, 4, 0]} barSize={12} isAnimationActive={false}>
                <LabelList dataKey="llmOnly" position="right" fill="var(--color-muted)" fontSize={11} formatter={(v) => `${v}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle
          hint={`${report.calls.length} Qloo API calls made for this check${
            liveCalls ? ` (${liveCalls} live)` : " (sample data in preview mode)"
          }. Every number on the scorecard comes from these.`}
        >
          Every Qloo call
        </CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-faint">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Request</th>
                <th className="py-2 pr-3 text-right font-semibold">Results</th>
                <th className="py-2 pr-3 text-right font-semibold">Time</th>
                <th className="py-2 font-semibold">Data</th>
              </tr>
            </thead>
            <tbody>
              {report.calls.map((c, i) => (
                <tr key={i} className="border-b border-line/50 align-top">
                  <td className="py-2 pr-3 font-mono text-faint">{i + 1}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-violet-soft">{describeCall(c)}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums">{c.resultCount}</td>
                  <td className="py-2 pr-3 text-right font-mono tabular-nums text-muted">{callTime(c)}</td>
                  <td className="py-2 text-xs">
                    {c.ok ? (c.mock ? <span className="text-faint">Sample</span> : <span className="text-lime">Live</span>) : (
                      <span className="text-red-300">Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-muted">
      <span className="h-3 w-3 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
