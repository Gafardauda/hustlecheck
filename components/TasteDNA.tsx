import type { TasteDomain } from "@/lib/report";

/**
 * Cross-domain taste profile — what the target customer loves beyond the idea itself.
 * This is Qloo's signature strength (an LLM can't reliably link taste across domains),
 * so it gets a bold, colourful card.
 */
export default function TasteDNA({ domains, crowd }: { domains: TasteDomain[]; crowd: string }) {
  if (!domains.length) return null;
  return (
    <section className="rounded-2xl border border-violet/60 bg-gradient-to-br from-panel to-panel-2 p-5 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <h2 className="text-base font-bold">
          Your customer&apos;s <span className="text-gradient">Taste DNA</span>
        </h2>
      </div>
      <p className="mb-5 text-sm text-muted">
        Beyond your idea, here&apos;s what {crowd} into this are also into — straight from Qloo&apos;s taste graph. Gold
        for your branding, playlists and content.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {domains.map((d) => (
          <div key={d.key} className="rounded-xl border border-line bg-ink/40 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <span aria-hidden className="text-lg">
                {d.emoji}
              </span>
              {d.label}
            </p>
            <ul className="space-y-2">
              {d.items.map((item) => (
                <li key={item.name} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate" title={item.name}>
                    {item.name}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-violet-soft">
                    {Math.round(item.affinity * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
