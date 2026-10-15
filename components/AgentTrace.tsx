import type { AgentStep } from "@/lib/report";
import type { QlooCallRecord } from "@/lib/qloo";

/** "312ms", or "cached" when the server answered from its cache. */
export const callTime = (call: QlooCallRecord) => (call.cached ? "cached" : `${call.ms}ms`);

/** One line per Qloo call, e.g. "GET /v2/insights · urn:heatmap · Lagos". */
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
  revealed,
}: {
  /** Planned step titles, shown before results arrive. */
  titles: string[];
  steps?: AgentStep[];
  calls?: QlooCallRecord[];
  /** How many steps are complete. */
  revealed: number;
}) {
  return (
    <ol className="space-y-3" aria-live="polite">
      {titles.map((title, i) => {
        const step = steps?.[i];
        const done = i < revealed && Boolean(step);
        const active = !done && i === Math.min(revealed, titles.length - 1);
        return (
          <li
            key={title}
            className={`rounded-xl border p-4 transition ${
              done ? "border-line bg-panel" : active ? "border-violet bg-panel-2" : "border-line/50 opacity-50"
            }`}
          >
            <div className="flex items-center gap-3">
              <StatusIcon state={done ? "done" : active ? "active" : "pending"} />
              <span className="font-semibold">{step?.title ?? title}</span>
            </div>
            {done && step && (
              <div className="mt-2 pl-8">
                <p className="text-sm text-muted">{step.detail}</p>
                {step.callIndexes.length > 0 && calls && (
                  <ul className="mt-2 space-y-1">
                    {step.callIndexes.map((ci) => (
                      <li key={ci} className="flex flex-wrap gap-x-3 font-mono text-xs text-faint">
                        <span className="text-violet-soft">{describeCall(calls[ci])}</span>
                        <span>
                          {calls[ci].resultCount} results · {callTime(calls[ci])}
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
