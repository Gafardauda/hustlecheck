/**
 * The Qloo work behind a hustle check, shared by the Gemini agent (which decides
 * the keywords, brands and tags) and the keyword-matching fallback.
 *
 * A Run collects every Qloo call and streams steps/calls to the browser as they happen.
 */
import {
  cityQuery,
  findTags,
  getInsights,
  labelNeighbourhoods,
  searchEntities,
  type NeighbourhoodDemand,
  type QlooCallRecord,
  type QlooEntity,
  type QlooEntityType,
  type QlooParams,
  type QlooResult,
  type QlooTag,
} from "./qloo";
import type {
  AgentStep,
  CheckEvent,
  HustleInput,
  HustleReport,
  LaunchPlan,
  Pick,
  PickKind,
  StepKey,
  TasteDomain,
} from "./report";
import { audience as audienceConfig, stepTitle } from "./report";
import { BENCHMARK } from "./benchmark";
import { computePulseScore, computeSubScores } from "./score";

export class Run {
  readonly calls: QlooCallRecord[] = [];
  readonly steps: AgentStep[] = [];
  readonly notes: string[] = [];
  /** Tag IDs Qloo actually returned in this run; only these may be used as signals. */
  readonly knownTags = new Map<string, QlooTag>();
  readonly knownBrands = new Map<string, QlooEntity>();
  /** Local artists the audience loves, used as anchors for partner picks. */
  readonly knownArtists = new Map<string, QlooEntity>();

  constructor(
    readonly input: HustleInput,
    readonly opts: { mock?: boolean },
    private readonly emit: (event: CheckEvent) => void,
  ) {}

  /** Await a Qloo call, record it, and stream it to the browser. Failed calls are recorded too. */
  async track<T>(promise: Promise<QlooResult<T>>): Promise<{ data: T; index: number } | { data: null; index: number }> {
    try {
      const result = await promise;
      return { data: result.data, index: this.record(result.call) };
    } catch (err) {
      const call = (err as { call?: QlooCallRecord }).call;
      if (!call) throw err;
      return { data: null, index: this.record(call) };
    }
  }

  private record(call: QlooCallRecord): number {
    this.calls.push(call);
    const index = this.calls.length - 1;
    this.emit({ type: "call", index, call });
    return index;
  }

  /** Add or replace the step for `key` and stream it. */
  step(key: StepKey, detail: string, callIndexes: number[] = []) {
    const step: AgentStep = { key, title: stepTitle(key, this.input.city), detail, callIndexes };
    const existing = this.steps.findIndex((s) => s.key === key);
    if (existing >= 0) {
      step.callIndexes = [...this.steps[existing].callIndexes, ...callIndexes];
      this.steps[existing] = step;
    } else {
      this.steps.push(step);
    }
    this.emit({ type: "step", step });
  }
}

// ---------------------------------------------------------------------------
// Stage 1: resolve the idea into Qloo tags and comparable brands
// ---------------------------------------------------------------------------

export interface ResearchResult {
  tags: { id: string; name: string; appliesTo: string[] }[];
  brands: { id: string; name: string; description?: string }[];
  artists: { id: string; name: string }[];
  emptyKeywords: string[];
  missingBrands: string[];
}

export async function researchIdea(
  run: Run,
  keywords: string[],
  brandNames: string[],
  artistNames: string[] = [],
): Promise<ResearchResult> {
  const [tagResults, brandResults, artistResults] = await Promise.all([
    Promise.all(keywords.map((k) => run.track(findTags(k, { take: 5, ...run.opts })))),
    Promise.all(
      brandNames.map((b) => run.track(searchEntities(b, { types: ["urn:entity:brand"], take: 1, ...run.opts }))),
    ),
    Promise.all(
      artistNames.map((a) => run.track(searchEntities(a, { types: ["urn:entity:artist"], take: 1, ...run.opts }))),
    ),
  ]);

  const tags: ResearchResult["tags"] = [];
  const emptyKeywords: string[] = [];
  tagResults.forEach((r, i) => {
    const found = r.data?.results.tags ?? [];
    if (!found.length) emptyKeywords.push(keywords[i]);
    for (const t of found) {
      run.knownTags.set(t.id, t);
      tags.push({ id: t.id, name: t.name, appliesTo: (t.parents ?? []).map((p) => p.type.replace("urn:entity:", "")) });
    }
  });

  const brands: ResearchResult["brands"] = [];
  const missingBrands: string[] = [];
  brandResults.forEach((r, i) => {
    const hit = r.data?.results[0];
    if (!hit) return void missingBrands.push(brandNames[i]);
    run.knownBrands.set(hit.entity_id, hit);
    brands.push({ id: hit.entity_id, name: hit.name, description: hit.properties?.short_description });
  });

  const artists: ResearchResult["artists"] = [];
  for (const r of artistResults) {
    const hit = r.data?.results[0];
    if (!hit) continue;
    run.knownArtists.set(hit.entity_id, hit);
    artists.push({ id: hit.entity_id, name: hit.name });
  }

  const unique = [...new Map(tags.map((t) => [t.id, t])).values()];
  run.step(
    "idea",
    `Matched ${keywords.map((k) => `“${k}”`).join(", ")} to ${unique.length} taste signals, ${brands.length} similar brands${artists.length ? ` and ${artists.length} local artists` : ""}.`,
    [...tagResults, ...brandResults, ...artistResults].map((r) => r.index),
  );
  return { tags: unique, brands, artists, emptyKeywords, missingBrands };
}

// ---------------------------------------------------------------------------
// Stage 2: Gen Z audience, city heatmap and partners, in parallel, with fallbacks
// ---------------------------------------------------------------------------

export interface MarketResult {
  comparableBrands: Pick[];
  neighbourhoods: NeighbourhoodDemand[];
  partners: Pick[];
  tasteDNA: TasteDomain[];
  heatmapCells: number;
}

/** Cross-domain taste: what else the target customer loves, beyond the idea itself. */
const TASTE_DOMAINS: { type: QlooEntityType; key: string; label: string; emoji: string }[] = [
  { type: "urn:entity:movie", key: "movie", label: "Films", emoji: "🎬" },
  { type: "urn:entity:tv_show", key: "tv", label: "Shows", emoji: "📺" },
  { type: "urn:entity:video_game", key: "game", label: "Games", emoji: "🎮" },
  { type: "urn:entity:book", key: "book", label: "Reads", emoji: "📚" },
];

function toPick(entity: QlooEntity, kind: PickKind): Pick {
  return {
    name: entity.name,
    kind,
    affinity: entity.query?.affinity ?? entity.popularity,
    description: entity.properties?.short_description ?? entity.properties?.description,
    imageUrl: entity.properties?.image?.url,
  };
}

/**
 * Run `attempts` in order until one returns results. Qloo silently returns nothing
 * for signal combinations it can't use, so each stage relaxes its signals step by step.
 */
async function firstWithResults(
  run: Run,
  attempts: { params: QlooParams; note?: string }[],
  count: (d: NonNullable<Awaited<ReturnType<typeof getInsights>>["data"]>) => number,
) {
  const indexes: number[] = [];
  for (const attempt of attempts) {
    const r = await run.track(getInsights(attempt.params, run.opts));
    indexes.push(r.index);
    if (r.data && count(r.data) > 0) {
      if (attempt.note) run.notes.push(attempt.note);
      return { data: r.data, indexes };
    }
  }
  return { data: null, indexes };
}

export async function analyzeMarket(run: Run, tagIds: string[], brandIds: string[]): Promise<MarketResult> {
  const city = run.input.city;
  // What we send to Qloo as the location (some city names are ambiguous); display stays `city`.
  const locationQuery = cityQuery(city);
  const tags = tagIds.filter((id) => run.knownTags.has(id)).slice(0, 4);
  const brands = brandIds.filter((id) => run.knownBrands.has(id)).slice(0, 4);
  const placeTags = tags.filter((id) => run.knownTags.get(id)?.parents?.some((p) => p.type === "urn:entity:place"));
  const age = audienceConfig(run.input.audience).age;

  const full: QlooParams = {
    "signal.interests.tags": tags,
    "signal.interests.entities": brands,
    "signal.demographics.age": age,
  };
  const tagsOnly: QlooParams = { "signal.interests.tags": tags, "signal.demographics.age": age };
  const entities = (d: { results: { entities?: unknown[] } }) => d.results.entities?.length ?? 0;
  const cells = (d: { results: { heatmap?: unknown[] } }) => d.results.heatmap?.length ?? 0;

  const audience = (async () => {
    const r = await firstWithResults(
      run,
      [
        { params: { "filter.type": "urn:entity:brand", ...full, take: 8 } },
        {
          params: { "filter.type": "urn:entity:brand", ...tagsOnly, take: 8 },
          note: "Comparable brands were measured from taste tags only (brand signals returned nothing).",
        },
      ],
      entities,
    );
    const picks = (r.data?.results.entities ?? []).slice(0, 5).map((e) => toPick(e, "brand"));
    run.step("audience", `Checked how much ${audienceConfig(run.input.audience).crowd} like ${picks.length} brands like yours.`, r.indexes);
    return picks;
  })();

  const location = (async () => {
    const heat = { "filter.type": "urn:heatmap", "filter.location.query": locationQuery };
    const r = await firstWithResults(
      run,
      [
        { params: { ...heat, ...full } },
        ...(placeTags.length
          ? [
              {
                params: { ...heat, "signal.interests.tags": placeTags, "signal.demographics.age": age },
                note: `The ${city} heatmap used place tags only.`,
              },
            ]
          : []),
        {
          params: { ...heat, ...tagsOnly, "signal.demographics.age": undefined },
          note: `The ${city} heatmap used all ages (the age-filtered version returned no spots).`,
        },
      ],
      cells,
    );
    const heatmap = r.data?.results.heatmap ?? [];
    const hoods = labelNeighbourhoods(heatmap, city);
    run.step(
      "location",
      hoods.length
        ? `Scanned ${heatmap.length} spots across ${city}. ${hoods[0].name} wants this most.`
        : `No neighbourhood-level demand data for ${city} yet.`,
      r.indexes,
    );
    return { hoods, cells: heatmap.length };
  })();

  const partners = (async () => {
    // Artists and podcasts aren't tied to a city, so bias them with Qloo's location signal,
    // and anchor artists on the local artists the agent named (if Qloo found them).
    const local = { "signal.location.query": locationQuery };
    const anchors = [...run.knownArtists.keys()].slice(0, 2);
    const artistSignal: QlooParams = anchors.length ? { ...tagsOnly, ...local, "signal.interests.entities": anchors } : { ...full, ...local };
    const kinds: [PickKind, QlooParams, QlooParams][] = [
      ["artist", { "filter.type": "urn:entity:artist", take: 4 }, artistSignal],
      ["podcast", { "filter.type": "urn:entity:podcast", take: 3 }, { ...full, ...local }],
      ["place", { "filter.type": "urn:entity:place", "filter.location.query": locationQuery, take: 4 }, full],
    ];
    const anchorNames = new Set(anchors.map((id) => run.knownArtists.get(id)!.name));
    const results = await Promise.all(
      kinds.map(([kind, base, signal]) =>
        firstWithResults(
          run,
          [
            { params: { ...base, ...signal } },
            { params: { ...base, ...tagsOnly, ...(kind === "place" ? {} : local) } },
            {
              params: { ...base, "signal.interests.tags": tags },
              note: `${kind === "place" ? "Venue" : kind[0].toUpperCase() + kind.slice(1)} picks used all ages.`,
            },
          ],
          entities,
        ).then((r) => ({ kind, ...r })),
      ),
    );
    const picks = results
      .flatMap((r) => (r.data?.results.entities ?? []).map((e) => toPick(e, r.kind)))
      // Don't recommend the anchor artists back to the user as discoveries.
      .filter((p) => !(p.kind === "artist" && anchorNames.has(p.name)))
      .sort((a, b) => b.affinity - a.affinity);
    run.step(
      "partners",
      `Lined up ${picks.length} artists, podcasts and ${city} venues to collab with.`,
      results.flatMap((r) => r.indexes),
    );
    return picks;
  })();

  // Taste DNA: what else this customer loves, across films, shows, games and books.
  const tasteDNA = (async (): Promise<TasteDomain[]> => {
    const results = await Promise.all(
      TASTE_DOMAINS.map((d) =>
        firstWithResults(
          run,
          [{ params: { "filter.type": d.type, ...full, take: 5 } }, { params: { "filter.type": d.type, ...tagsOnly, take: 5 } }],
          entities,
        ).then((r) => ({ d, r })),
      ),
    );
    const domains = results
      .map(({ d, r }) => ({
        key: d.key,
        label: d.label,
        emoji: d.emoji,
        items: (r.data?.results.entities ?? []).slice(0, 4).map((e) => ({
          name: e.name,
          affinity: e.query?.affinity ?? e.popularity,
          imageUrl: e.properties?.image?.url,
        })),
      }))
      .filter((d) => d.items.length > 0);
    run.step(
      "taste",
      domains.length
        ? `Mapped their taste across ${domains.map((d) => d.label.toLowerCase()).join(", ")}.`
        : "No cross-domain taste data for this one.",
      results.flatMap(({ r }) => r.indexes),
    );
    return domains;
  })();

  const [comparableBrands, loc, partnerPicks, dna] = await Promise.all([audience, location, partners, tasteDNA]);
  return {
    comparableBrands,
    neighbourhoods: loc.hoods,
    partners: partnerPicks,
    tasteDNA: dna,
    heatmapCells: loc.cells,
  };
}

// ---------------------------------------------------------------------------
// Stage 3: score and assemble the report
// ---------------------------------------------------------------------------

export function scoreMarket(run: Run, market: MarketResult) {
  const subScores = computeSubScores({
    brandAffinities: market.comparableBrands.map((b) => b.affinity),
    neighbourhoodAffinities: market.neighbourhoods.map((n) => n.affinity),
    partnerAffinities: market.partners.map((p) => p.affinity),
  });
  const pulseScore = computePulseScore(subScores);
  run.step("score", `Added it all up — your PulseScore is ${pulseScore}.`);
  return { subScores, pulseScore };
}

/** Keep only plan items that point at real data, so the plan can't cite made-up places or partners. */
export function groundPlan(plan: LaunchPlan, market: MarketResult, fallback: LaunchPlan): LaunchPlan {
  const hoods = new Set(market.neighbourhoods.map((n) => n.name.toLowerCase()));
  const partners = new Map(market.partners.map((p) => [p.name.toLowerCase(), p]));
  const where = plan.where.filter((w) => hoods.has(w.neighbourhood.toLowerCase()));
  const collabs = plan.collabs
    .filter((c) => partners.has(c.name.toLowerCase()))
    .map((c) => ({ ...c, kind: partners.get(c.name.toLowerCase())!.kind }));
  return {
    headline: plan.headline || fallback.headline,
    where: where.length ? where : fallback.where,
    collabs: collabs.length ? collabs : fallback.collabs,
    names: plan.names.length ? plan.names.slice(0, 6) : fallback.names,
    checklist: plan.checklist.length ? plan.checklist.slice(0, 10) : fallback.checklist,
  };
}

/** A plan built from the data alone, used by the fallback and to fill gaps in the agent's plan. */
export function templatePlan(input: HustleInput, market: MarketResult, keywords: string[]): LaunchPlan {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const k1 = cap(keywords[0] ?? "Hustle");
  const k2 = cap(keywords[1] ?? "Club");
  const top = market.neighbourhoods.slice(0, 5);
  const first = top[0]?.name ?? input.city;
  const pickOf = (kind: PickKind) => market.partners.find((p) => p.kind === kind);
  const rank = ["Highest", "2nd-highest", "3rd-highest", "4th-highest", "5th-highest"];
  return {
    headline: `Launch in ${first} first, where the taste for ${k1.toLowerCase()} runs hottest.`,
    where: top.map((n, i) => ({
      neighbourhood: n.name,
      why: `${rank[i] ?? "High"} Gen Z affinity in ${input.city} (${Math.round(n.affinity * 100)}/100 across ${n.cells} map cells).`,
    })),
    collabs: (["artist", "podcast", "place"] as const)
      .map(pickOf)
      .filter((p): p is Pick => Boolean(p))
      .map((p) => ({
        name: p.name,
        kind: p.kind,
        idea:
          p.kind === "artist"
            ? `Pitch a playlist or styling collab — ${Math.round(p.affinity * 100)}% affinity with your audience.`
            : p.kind === "podcast"
              ? "Offer a listener discount code or guest spot."
              : "Ask about a weekend pop-up or flyer spot.",
      })),
    names: [...new Set([`${k1} Pulse`, `The ${k1} Drop`, `${input.city} ${k2} Co.`, `${k1}${k2}`])],
    checklist: [
      { week: 1, task: `Visit ${first} and talk to 10 potential customers.` },
      { week: 1, task: "Set up an Instagram and TikTok page with your chosen name." },
      { week: 2, task: `Reach out to ${pickOf("place")?.name ?? "one local venue"} about a pop-up slot.` },
      { week: 3, task: `Run your first pop-up in ${first}; track sales and DMs.` },
      { week: 4, task: `Test a second spot in ${top[1]?.name ?? "a nearby area"} and compare results.` },
    ],
  };
}

export function assembleReport(
  run: Run,
  parts: {
    source: HustleReport["source"];
    model?: string;
    market: MarketResult;
    score: ReturnType<typeof scoreMarket>;
    plan: LaunchPlan;
    usedTagIds: string[];
  },
): HustleReport {
  return {
    input: run.input,
    generatedAt: new Date().toISOString(),
    source: parts.source,
    model: parts.model,
    usedMockData: run.calls.some((c) => c.mock),
    notes: run.notes,
    tags: parts.usedTagIds
      .map((id) => run.knownTags.get(id))
      .filter((t): t is QlooTag => Boolean(t))
      .map((t) => ({ id: t.id, name: t.name })),
    pulseScore: parts.score.pulseScore,
    subScores: parts.score.subScores,
    neighbourhoods: parts.market.neighbourhoods,
    comparableBrands: parts.market.comparableBrands,
    partners: parts.market.partners,
    tasteDNA: parts.market.tasteDNA,
    plan: parts.plan,
    steps: run.steps,
    calls: run.calls,
    benchmark: BENCHMARK,
  };
}
