"use client";

import { Cell, LabelList, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { NeighbourhoodDemand } from "@/lib/qloo";
import { AffinityBar, affinityColor } from "./ui";

/**
 * Neighbourhoods plotted by real coordinates (a simple "map"), bubble size = heatmap
 * cells, colour = affinity on a sequential lime scale. The ranked list beside it is
 * the accessible/table view of the same data.
 */
export default function NeighbourhoodMap({ neighbourhoods }: { neighbourhoods: NeighbourhoodDemand[] }) {
  if (!neighbourhoods.length) {
    return <p className="text-sm text-muted">Qloo returned no neighbourhood-level signal for this idea.</p>;
  }
  const values = neighbourhoods.map((n) => n.affinity);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const norm = (v: number) => (max === min ? 1 : (v - min) / (max - min));
  const topLabelled = new Set(neighbourhoods.slice(0, 5).map((n) => n.name));
  const data = neighbourhoods.map((n) => ({ ...n, label: topLabelled.has(n.name) ? n.name : "" }));

  return (
    <div className="grid gap-6 md:grid-cols-5">
      <div className="md:col-span-3">
        <div className="h-72 rounded-xl border border-line/60 bg-ink sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 24, right: 40, bottom: 16, left: 40 }}>
              <XAxis type="number" dataKey="lon" domain={["dataMin - 0.02", "dataMax + 0.02"]} hide />
              <YAxis type="number" dataKey="lat" domain={["dataMin - 0.02", "dataMax + 0.02"]} hide />
              <ZAxis type="number" dataKey="cells" range={[220, 1400]} />
              <Tooltip cursor={false} content={<MapTooltip />} />
              <Scatter data={data} isAnimationActive={false}>
                {data.map((n) => (
                  <Cell
                    key={n.name}
                    fill={affinityColor(norm(n.affinity))}
                    fillOpacity={0.85}
                    stroke="var(--color-ink)"
                    strokeWidth={2}
                  />
                ))}
                <LabelList dataKey="label" content={MapLabel} />
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap text-xs text-faint">
          <span>Lower demand</span>
          <span
            className="h-2 w-32 rounded-full"
            style={{ background: `linear-gradient(to right, ${affinityColor(0)}, ${affinityColor(1)})` }}
          />
          <span>Higher demand</span>
          <span className="sm:ml-auto">Bubble size = map coverage</span>
        </div>
      </div>

      <ol className="space-y-3 md:col-span-2">
        {neighbourhoods.slice(0, 8).map((n, i) => (
          <li key={n.name}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="font-semibold">
                <span className="mr-2 font-mono text-faint">{i + 1}</span>
                {n.name}
              </span>
              <span className="text-xs text-faint">{n.cells} spots</span>
            </div>
            <AffinityBar value={n.affinity} label={n.name} />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Single-line label above a bubble (Recharts' default label wraps long names). */
function MapLabel(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text
      x={Number(x) + Number(width ?? 0) / 2}
      y={Number(y) - 6}
      textAnchor="middle"
      fill="var(--color-fg)"
      fontSize={12}
      fontWeight={600}
    >
      {String(value)}
    </text>
  );
}

function MapTooltip({ active, payload }: { active?: boolean; payload?: { payload: NeighbourhoodDemand }[] }) {
  if (!active || !payload?.length) return null;
  const n = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm shadow-lg">
      <p className="font-semibold">{n.name}</p>
      <p className="text-muted">
        <span className="font-mono text-fg">{Math.round(n.affinity * 100)}%</span> match · peaks at{" "}
        <span className="font-mono text-fg">{Math.round(n.peakAffinity * 100)}%</span>
      </p>
      <p className="text-xs text-faint">across {n.cells} spots</p>
    </div>
  );
}
