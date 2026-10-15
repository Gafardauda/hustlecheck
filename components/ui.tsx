import type { PickKind } from "@/lib/report";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-panel p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function CardTitle({ children, hint }: { children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-bold">{children}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Horizontal 0–1 bar with the value printed beside it (single series, lime). */
export function AffinityBar({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3" title={label ? `${label}: ${pct}/100 affinity` : undefined}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line/70">
        <div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-sm tabular-nums text-fg">{pct}</span>
    </div>
  );
}

const KIND_LABEL: Record<PickKind, string> = {
  brand: "Brand",
  artist: "Artist",
  podcast: "Podcast",
  place: "Venue",
};

export function KindBadge({ kind }: { kind: PickKind }) {
  return (
    <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-soft">
      {KIND_LABEL[kind]}
    </span>
  );
}

/** Sequential scale for affinity on the dark surface: dim olive → brand lime. */
export function affinityColor(t: number): string {
  const from = [0x3a, 0x4a, 0x14];
  const to = [0xc6, 0xff, 0x3d];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
