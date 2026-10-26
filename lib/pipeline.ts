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
import { audience as audienceConfig, brandsLocalise, podcastsLocalise, stepTitle } from "./report";
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
  const researchStarted = Date.now();
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
  console.log(`[timing] research: ${Date.now() - researchStarted}ms`);
  return { tags: unique, brands, artists, emptyKeywords, missingBrands };
}

// ---------------------------------------------------------------------------
// Stage 2: Gen Z audience, city heatmap and partners, in parallel, with fallbacks
// ---------------------------------------------------------------------------

export interface MarketResult {
  comparableBrands: Pick[];
  /** True when comparableBrands fell back to global (non-localised) picks. */
  brandsGlobal: boolean;
  neighbourhoods: NeighbourhoodDemand[];
  partners: Pick[];
  tasteDNA: TasteDomain[];
  heatmapCells: number;
}

/** Cross-domain taste: what else the target customer loves, beyond the idea itself. */
// Books and video games are intentionally excluded: for these taste signals Qloo's book
// data returns off-target US-skewed junk (political memoirs, sports books), and the
// video_game insights call fails outright (four failed /v2/insights calls in the trace).
const TASTE_DOMAINS: { type: QlooEntityType; key: string; label: string; emoji: string }[] = [
  { type: "urn:entity:movie", key: "movie", label: "Films", emoji: "🎬" },
  { type: "urn:entity:tv_show", key: "tv", label: "Shows", emoji: "📺" },
];

// Place categories that don't suit a side-hustle collab: hotels/lodging (the main
// complaint), plus transit and fuel. We keep markets, cafés, restaurants, malls,
// event/conference spaces, campuses and the like.
const UNSUITABLE_VENUE_TAGS = [
  "hotel",
  "hostel",
  "motel",
  "resort",
  "lodging",
  "bed breakfast",
  "guest house",
  "guesthouse",
  "serviced apartment",
  "airport",
  "bus station",
  "train station",
  "gas station",
  "petrol",
];

/** True when a place is lodging/transit (by its Qloo category/genre tags), so we drop it. */
function isUnsuitableVenue(entity: QlooEntity): boolean {
  const categories = (entity.tags ?? [])
    .filter((t) => /:(category|genre):place/.test(t.type ?? ""))
    .map((t) => t.name.toLowerCase());
  return categories.some((name) => UNSUITABLE_VENUE_TAGS.some((bad) => name.includes(bad)));
}

// --- Artist quality + region filters ---------------------------------------
const CITY_REGION: Record<string, string> = {
  lagos: "africa", abuja: "africa", ibadan: "africa", accra: "africa",
  nairobi: "africa", "cape town": "africa", london: "uk", "new york": "na", toronto: "na",
};
// Nationality demonyms as they appear in Qloo artist descriptions → region.
const DEMONYM_REGION: Record<string, string> = {
  nigerian: "africa", ghanaian: "africa", kenyan: "africa", "south african": "africa",
  tanzanian: "africa", ugandan: "africa", ivorian: "africa", senegalese: "africa",
  cameroonian: "africa", beninese: "africa", togolese: "africa", zimbabwean: "africa",
  zambian: "africa", congolese: "africa", ethiopian: "africa", rwandan: "africa",
  malian: "africa", angolan: "africa", mozambican: "africa", namibian: "africa", african: "africa",
  british: "uk", english: "uk", scottish: "uk", welsh: "uk", irish: "uk",
  american: "na", canadian: "na",
  australian: "other", french: "other", german: "other", dutch: "other", swedish: "other",
  spanish: "other", italian: "other", brazilian: "other", jamaican: "other", indian: "other",
  korean: "other", japanese: "other", chinese: "other", filipino: "other", mexican: "other",
};

const entityDescription = (e: QlooEntity): string =>
  (e.properties?.short_description ?? e.properties?.description ?? "").trim();

// Qloo sometimes returns thin "artist" rows with a boilerplate description and no real
// detail (e.g. "Karim is an individual music artist. Specific details are limited.").
function hasRealDescription(e: QlooEntity): boolean {
  const d = entityDescription(e);
  if (d.length < 30) return false;
  return !/\b(individual (music )?artist|specific details|details are (limited|scarce|unavailable|not available)|little (is )?known|information is (limited|unavailable|scarce))\b/i.test(d);
}

// Keep artists whose stated nationality fits the city's region; drop clearly out-of-region
// ones (a British artist for Lagos). Artists with no stated nationality are kept.
function artistRegionOk(e: QlooEntity, city: string): boolean {
  const region = CITY_REGION[city.toLowerCase()];
  if (!region) return true;
  const d = entityDescription(e).toLowerCase();
  const regions = Object.entries(DEMONYM_REGION).filter(([dem]) => d.includes(dem)).map(([, r]) => r);
  if (!regions.length) return true; // no nationality stated → keep
  return regions.includes(region); // keep if any stated nationality matches the city's region
}

const isGoodArtist = (e: QlooEntity, city: string): boolean => hasRealDescription(e) && artistRegionOk(e, city);

// --- Brand relevance filter ------------------------------------------------
// Industries that are never a useful "brands your customers love" comp for a consumer
// side hustle (a bank or a charity showing up for a bubble-tea stand).
const IRRELEVANT_BRAND_CATS = [
  "financial", "finance", "bank", "insurance", "nonprofit", "non-profit", "ngo", "charity",
  "government", "aviation", "airline", "ridesharing", "transport", "logistics",
  "telecommunication", "telecom", "utility", "petroleum", "oil & gas", "real estate",
];
// Map the idea's words to the brand categories that fit it, so brands stay on-theme.
const IDEA_BRAND_DOMAINS: { match: RegExp; cats: string[] }[] = [
  { match: /\b(tea|coffee|cafe|café|food|jollof|chops?|restaurant|bakery|baker|drink|juice|smoothie|snack|bubble|boba|meal|eatery|bar|grill|pizza|kitchen|catering|dessert|pastry)\b/, cats: ["food & beverage", "drink", "beverage", "coffee & tea", "restaurant", "snack"] },
  { match: /\b(thrift|vintage|streetwear|clothing|cloth|fashion|sneakers?|apparel|wear|boutique|fabric|tailor|outfit|footwear|shoe)\b/, cats: ["apparel", "fashion", "footwear", "clothing", "retail", "luxury", "sportswear"] },
  { match: /\b(nail|beauty|skincare|salon|makeup|cosmetics?|hair|spa|lash|brow|wig|barber)\b/, cats: ["beauty", "cosmetic", "personal care", "health & beauty", "hair care", "skincare"] },
  { match: /\b(gym|fitness|workout|dance|yoga|pilates|sports?|athletic|amapiano)\b/, cats: ["sport", "fitness", "activewear", "athletic", "sportswear", "health & wellness"] },
  { match: /\b(studio|content|photo|podcast|design|art|creator|video|music|film|media|gaming|game|tech)\b/, cats: ["technology", "media", "software", "app", "electronics", "entertainment", "gaming"] },
];

const brandCategoryText = (e: QlooEntity): string => (e.tags ?? []).map((t) => t.name).join(" ").toLowerCase();

const isIrrelevantBrand = (e: QlooEntity): boolean =>
  IRRELEVANT_BRAND_CATS.some((bad) => brandCategoryText(e).includes(bad));

/** 1 when the brand's categories/description match the idea's domain, else 0 (used to sort). */
function brandRelevance(e: QlooEntity, cats: string[]): number {
  if (!cats.length) return 0;
  const s = `${brandCategoryText(e)} ${entityDescription(e).toLowerCase()}`;
  return cats.some((c) => s.includes(c)) ? 1 : 0;
}

// --- Per-stage timing (to find and speed up slow steps) --------------------
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label}: ${Date.now() - t0}ms`);
  }
}

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

  // A geography signal to bias non-place entities (brands, artists, taste) toward
  // the city. Qloo silently ignores signals a filter.type can't use, so each stage
  // tries the located query first and falls back to a global query if it returns nothing.
  const locale: QlooParams = { "signal.location.query": locationQuery };
  const full: QlooParams = {
    "signal.interests.tags": tags,
    "signal.interests.entities": brands,
    "signal.demographics.age": age,
  };
  const tagsOnly: QlooParams = { "signal.interests.tags": tags, "signal.demographics.age": age };
  const entities = (d: { results: { entities?: unknown[] } }) => d.results.entities?.length ?? 0;
  const cells = (d: { results: { heatmap?: unknown[] } }) => d.results.heatmap?.length ?? 0;
  const globalBrandsNote = `Qloo had no ${city}-specific brand data, so these are global brands your crowd loves.`;

  // Qloo returns genuinely local brands for some markets (London → Palace, Dr. Martens)
  // but only global fashion houses for cities where it under-indexes local brands, so
  // we label those picks honestly as global rather than implying they're local.
  const brandsGlobal = !brandsLocalise(city);
  // Which brand categories fit this idea, so a bubble-tea stand surfaces drinks brands,
  // not a bank or a charity.
  const ideaText = `${run.input.idea} ${tags.map((id) => run.knownTags.get(id)?.name ?? "").join(" ")}`.toLowerCase();
  const ideaBrandCats = IDEA_BRAND_DOMAINS.filter((d) => d.match.test(ideaText)).flatMap((d) => d.cats);
  const audience = timed("brands", async () => {
    // Keep the idea's taste tags in every attempt so results stay on-theme (thrift,
    // vintage, streetwear) rather than drifting to general fashion. Location is sent
    // too; it helps where Qloo has local brand data and is harmless where it doesn't.
    const r = await firstWithResults(
      run,
      [
        { params: { "filter.type": "urn:entity:brand", ...full, ...locale, take: 10 } },
        { params: { "filter.type": "urn:entity:brand", ...tagsOnly, ...locale, take: 10 } },
        { params: { "filter.type": "urn:entity:brand", ...full, take: 10 } },
        { params: { "filter.type": "urn:entity:brand", ...tagsOnly, take: 10 } },
      ],
      entities,
    );
    if (brandsGlobal) run.notes.push(globalBrandsNote);
    // Drop off-theme industries (banks, charities, airlines…). If Qloo has enough brands
    // that match the idea's domain, show only those; otherwise fall back to on-theme-first
    // so the section isn't left thin when the domain pool is small.
    const affinity = (e: QlooEntity) => e.query?.affinity ?? e.popularity;
    const kept = (r.data?.results.entities ?? []).filter((e) => !isIrrelevantBrand(e));
    const onTheme = kept.filter((e) => brandRelevance(e, ideaBrandCats) === 1).sort((a, b) => affinity(b) - affinity(a));
    const chosen =
      onTheme.length >= 3
        ? onTheme
        : [...kept].sort((a, b) => {
            const rel = brandRelevance(b, ideaBrandCats) - brandRelevance(a, ideaBrandCats);
            return rel !== 0 ? rel : affinity(b) - affinity(a);
          });
    const picks = chosen.slice(0, 5).map((e) => toPick(e, "brand"));
    run.step("audience", `Checked how much ${audienceConfig(run.input.audience).crowd} like ${picks.length} brands like yours.`, r.indexes);
    return picks;
  });

  const location = timed("location", async () => {
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
  });

  const partners = timed("partners", async () => {
    // Bias partners toward the city with Qloo's location signal, and anchor artists on
    // the local artists the agent named (if Qloo found them).
    const local = locale;
    const anchors = [...run.knownArtists.keys()].slice(0, 2);
    const anchorNames = new Set(anchors.map((id) => run.knownArtists.get(id)!.name));
    // Qloo's podcast data is US-centric and doesn't localise, so we only include it
    // for cities where it's credible; elsewhere we show no podcasts rather than US names.
    const showPodcasts = podcastsLocalise(city);
    // Over-fetch artists so enough survive the description/region filter.
    const artistBase = { "filter.type": "urn:entity:artist" as const, take: 12 };
    // Over-fetch places so enough suitable venues survive the lodging/transit filter.
    const placeBase = { "filter.type": "urn:entity:place" as const, "filter.location.query": locationQuery, take: 12 };

    // Per-kind attempt ladders. Artists get a location+age-only fallback so that when the
    // agent names no local artists, picks come from the city's own popular artists rather
    // than drifting to US names via the idea's tags and brand signals.
    const ladders: { kind: PickKind; attempts: { params: QlooParams; note?: string }[] }[] = [
      {
        kind: "artist",
        attempts: [
          ...(anchors.length
            ? [{ params: { ...artistBase, ...tagsOnly, ...local, "signal.interests.entities": anchors } }]
            : []),
          { params: { ...artistBase, "signal.location.query": locationQuery, "signal.demographics.age": age } },
          {
            params: { ...artistBase, "signal.interests.tags": tags, "signal.location.query": locationQuery },
            note: "Artist picks used all ages.",
          },
        ],
      },
      ...(showPodcasts
        ? [
            {
              kind: "podcast" as PickKind,
              attempts: [
                { params: { "filter.type": "urn:entity:podcast", take: 3, ...full, ...local } },
                { params: { "filter.type": "urn:entity:podcast", take: 3, ...tagsOnly, ...local } },
                {
                  params: { "filter.type": "urn:entity:podcast", take: 3, "signal.interests.tags": tags },
                  note: "Podcast picks used all ages.",
                },
              ],
            },
          ]
        : []),
      {
        kind: "place",
        attempts: [
          { params: { ...placeBase, ...full } },
          { params: { ...placeBase, ...tagsOnly } },
          { params: { ...placeBase, "signal.interests.tags": tags }, note: "Venue picks used all ages." },
        ],
      },
    ];
    const results = await Promise.all(
      ladders.map(({ kind, attempts }) => firstWithResults(run, attempts, entities).then((r) => ({ kind, ...r }))),
    );
    const picks = results
      .flatMap((r) => {
        let ents = r.data?.results.entities ?? [];
        // Drop hotels/lodging/transit from venue picks, then keep the best few.
        if (r.kind === "place") ents = ents.filter((e) => !isUnsuitableVenue(e)).slice(0, 5);
        // Drop thin or out-of-region artists (no real description, or wrong region).
        if (r.kind === "artist") ents = ents.filter((e) => isGoodArtist(e, city)).slice(0, 4);
        return ents.map((e) => toPick(e, r.kind));
      })
      // Don't recommend the anchor artists back to the user as discoveries.
      .filter((p) => !(p.kind === "artist" && anchorNames.has(p.name)))
      .sort((a, b) => b.affinity - a.affinity);
    run.step(
      "partners",
      `Lined up ${picks.length} ${showPodcasts ? "artists, podcasts and" : "artists and"} ${city} venues to collab with.`,
      results.flatMap((r) => r.indexes),
    );
    return picks;
  });

  // Taste DNA: what else this customer loves, across films and shows.
  const tasteDNA = timed("tasteDNA", async (): Promise<TasteDomain[]> => {
    const results = await Promise.all(
      TASTE_DOMAINS.map((d) =>
        firstWithResults(
          run,
          [
            { params: { "filter.type": d.type, ...full, ...locale, take: 5 } },
            { params: { "filter.type": d.type, ...tagsOnly, ...locale, take: 5 } },
            { params: { "filter.type": d.type, ...full, take: 5 } },
            { params: { "filter.type": d.type, ...tagsOnly, take: 5 } },
          ],
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
  });

  const [comparableBrands, loc, partnerPicks, dna] = await Promise.all([audience, location, partners, tasteDNA]);
  return {
    comparableBrands,
    brandsGlobal,
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
    brandsGlobal: parts.market.brandsGlobal,
    partners: parts.market.partners,
    tasteDNA: parts.market.tasteDNA,
    plan: parts.plan,
    steps: run.steps,
    calls: run.calls,
    benchmark: BENCHMARK,
  };
}
