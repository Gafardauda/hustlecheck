import type { AgentStep, StepKey } from "@/lib/report";
import type { QlooCallRecord } from "@/lib/qloo";

/** "312ms", or "cached" when the server answered from its cache. */
export const callTime = (call: QlooCallRecord) => (call.cached ? "cached" : `${call.ms}ms`);

/** One line per Qloo call, e.g. "GET /v2/insights · heatmap · Lagos · Gen Z". */
export function describeCall(call: QlooCallRecord): string {
  const p = call.params;
  const parts = [
    p["filter.type"]?.replace("urn:entity:", "").replace("urn:", ""),
    p.query && `“${p.query}”`,
    p["filter.query"] && `“${p["filter.query"]}”`,
    p["filter.location.query"],
    p["signal.demographics.age"] && "Gen Z",
  ].filter(Boolean);
  return `GET ${call.endpoint}${parts.length ? ` · ${parts.join(" · ")}` : ""}`;
}

export default function AgentTrace({
  titles,
  steps,
  calls,
}: {
  /** Every stage in display order. */
  titles: { key: StepKey; title: string }[];
  /** Finished steps, in the order they finished. */
  steps: AgentStep[];
  calls: QlooCallRecord[];
}) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const activeKey = titles.find((t) => !byKey.has(t.key))?.key;
  return (
    <ol className="space-y-3" aria-live="polite">
      {titles.map(({ key, title }) => {
        const step = byKey.get(key);
        const state = step ? "done" : key === activeKey ? "active" : "pending";
        return (
          <li
            key={key}
            className={`rounded-xl border p-4 transition ${
              state === "done" ? "border-line bg-panel" : state === "active" ? "border-violet bg-panel-2" : "border-line/50 opacity-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <StatusIcon state={state} />
              <span className="font-semibold">{step?.title ?? title}</span>
            </div>
            {step && (
              <div className="mt-2 pl-8">
                <p className="text-sm text-muted">{step.detail}</p>
                {step.callIndexes.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {step.callIndexes
                      .filter((ci) => calls[ci])
                      .map((ci) => (
                        <li key={ci} className="flex flex-wrap gap-x-3 font-mono text-xs text-faint">
                          <span className="text-violet-soft">{describeCall(calls[ci])}</span>
                          <span>
                            {calls[ci].ok ? `${calls[ci].resultCount} results` : "failed"} · {callTime(calls[ci])}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StatusIcon({ state }: { state: "done" | "active" | "pending" }) {
  if (state === "done")
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime text-xs font-black text-ink">
        ✓<span className="sr-only">Done</span>
      </span>
    );
  if (state === "active")
    return (
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-soft border-t-transparent">
        <span className="sr-only">In progress</span>
      </span>
    );
  return (
    <span className="h-5 w-5 rounded-full border-2 border-line">
      <span className="sr-only">Waiting</span>
    </span>
  );
}
