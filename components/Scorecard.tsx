import { audience, type HustleReport, type Pick } from "@/lib/report";
import { FORMULA_TEXT } from "@/lib/score";
import NeighbourhoodMap from "./NeighbourhoodMap";
import PulseScoreHero from "./PulseScoreHero";
import TasteDNA from "./TasteDNA";
import { AffinityBar, Card, CardTitle, KindBadge } from "./ui";

export default function Scorecard({ report }: { report: HustleReport }) {
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="animate-pop-in lg:col-span-2">
        <PulseScoreHero score={report.pulseScore} city={report.input.city} />
      </Card>
      <Card className="lg:col-span-3">
        <CardTitle hint={FORMULA_TEXT}>What makes up your score</CardTitle>
        <ul className="space-y-5">
          {report.subScores.map((s) => (
            <li key={s.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="font-semibold">
                  {s.label} <span className="text-xs font-normal text-faint">counts for {Math.round(s.weight * 100)}%</span>
                </span>
              </div>
              <AffinityBar value={s.score / 100} label={s.label} />
              <p className="mt-1 text-xs text-faint">{s.evidence}</p>
            </li>
          ))}
        </ul>
      </Card>

      {report.tasteDNA.length > 0 && (
        <div className="lg:col-span-5">
          <TasteDNA domains={report.tasteDNA} crowd={audience(report.input.audience).crowd} />
        </div>
      )}

      <Card className="lg:col-span-5">
        <CardTitle hint={`The areas of ${report.input.city} most into your idea. Brighter = more demand.`}>
          Where the demand is hottest
        </CardTitle>
        <NeighbourhoodMap neighbourhoods={report.neighbourhoods} />
      </Card>

      <Card className="lg:col-span-2">
        <CardTitle hint="Brands your future customers already love.">Brands they already love</CardTitle>
        <PickList picks={report.comparableBrands} />
      </Card>
      <Card className="lg:col-span-3">
        <CardTitle hint="Artists, podcasts and venues your crowd is into — reach out to these.">
          Your collab squad
        </CardTitle>
        <PickList picks={report.partners.slice(0, 6)} showKind />
      </Card>

      {report.tags.length > 0 && (
        <p className="text-xs text-faint lg:col-span-5">
          We matched your idea to:{" "}
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
