import type { HustleReport, Pick } from "@/lib/report";
import { FORMULA_TEXT, scoreVerdict } from "@/lib/score";
import NeighbourhoodMap from "./NeighbourhoodMap";
import { AffinityBar, Card, CardTitle, KindBadge } from "./ui";

export default function Scorecard({ report }: { report: HustleReport }) {
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-2">
        <PulseScoreHero score={report.pulseScore} />
      </Card>
      <Card className="lg:col-span-3">
        <CardTitle hint={FORMULA_TEXT}>What drives the score</CardTitle>
        <ul className="space-y-5">
          {report.subScores.map((s) => (
            <li key={s.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {s.label} <span className="text-xs font-normal text-faint">× {Math.round(s.weight * 100)}%</span>
                </span>
              </div>
              <AffinityBar value={s.score / 100} label={s.label} />
              <p className="mt-1 text-xs text-faint">{s.evidence}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="lg:col-span-5">
        <CardTitle
          hint={`Where Gen Z taste for your idea over-indexes in ${report.input.city}, from Qloo's heatmap. Brighter = stronger demand.`}
        >
          Neighbourhood demand
        </CardTitle>
        <NeighbourhoodMap neighbourhoods={report.neighbourhoods} />
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle hint="Brands your future customers already love (Gen Z affinity).">Comparable brands</CardTitle>
        <PickList picks={report.comparableBrands} />
      </Card>
      <Card className="lg:col-span-3">
        <CardTitle hint="Artists, podcasts and venues your audience over-indexes on.">Partner picks</CardTitle>
        <PickList picks={report.partners.slice(0, 6)} showKind />
      </Card>

      {report.tags.length > 0 && (
        <p className="text-xs text-faint lg:col-span-5">
          Qloo taste tags used:{" "}
          {report.tags.map((t) => (
            <code key={t.id} className="mr-2 rounded bg-panel px-1.5 py-0.5 text-violet-soft">
              {t.name}
            </code>
          ))}
        </p>
      )}
    </div>
  );
}

function PulseScoreHero({ score }: { score: number }) {
  const verdict = scoreVerdict(score);
  const r = 70;
  const circumference = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted">PulseScore</p>
      <div className="relative mt-3">
        <svg width="180" height="180" viewBox="0 0 180 180" role="img" aria-label={`PulseScore ${score} out of 100`}>
          <circle cx="90" cy="90" r={r} fill="none" stroke="var(--color-line)" strokeWidth="12" />
          <circle
            cx="90"
            cy="90"
            r={r}
            fill="none"
            stroke="var(--color-lime)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - score / 100)}
            transform="rotate(-90 90 90)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-6xl font-black tabular-nums">{score}</span>
          <span className="text-xs text-faint">out of 100</span>
        </div>
      </div>
      <p
        className={`mt-4 rounded-full px-3 py-1 text-sm font-bold ${
          verdict.tone === "strong"
            ? "bg-lime text-ink"
            : verdict.tone === "promising"
              ? "bg-violet text-fg"
              : "border border-line text-muted"
        }`}
      >
        {verdict.label}
      </p>
    </div>
  );
}

function PickList({ picks, showKind = false }: { picks: Pick[]; showKind?: boolean }) {
  if (!picks.length) return <p className="text-sm text-muted">No strong matches found.</p>;
  return (
    <ul className="space-y-4">
      {picks.map((p) => (
        <li key={`${p.kind}-${p.name}`}>
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold">{p.name}</span>
            {showKind && <KindBadge kind={p.kind} />}
          </div>
          {p.description && <p className="mb-1.5 line-clamp-1 text-xs text-faint">{p.description}</p>}
          <AffinityBar value={p.affinity} label={p.name} />
        </li>
      ))}
    </ul>
  );
}
