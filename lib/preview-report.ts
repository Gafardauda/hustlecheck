/**
 * Preview builder: produces a full HustleReport without the LLM, using simple
 * keyword matching and Qloo sample data. It follows the same flow the Gemini
 * agent will (see CLAUDE.md "Agent flow"), so the screens can be built and
 * demoed now and the agent can replace this later without UI changes.
 */
import {
  findTags,
  getInsights,
  labelNeighbourhoods,
  searchEntities,
  type QlooCallRecord,
  type QlooEntity,
  type QlooResult,
} from "./qloo";
import type { AgentStep, HustleInput, HustleReport, Pick, PickKind } from "./report";
import { computePulseScore, computeSubScores } from "./score";

const GEN_Z_AGE = "24_and_younger";

const STOPWORDS = new Set(
  "a an and the for of to in on at with by from my our your their this that into near selling sell sells business hustle side idea shop store start starting students student young people gen genz online offline small local city"
    .split(" "),
);

function extractKeywords(idea: string, city: string): string[] {
  const words = idea
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w) && w !== city.toLowerCase());
  return [...new Set(words)].slice(0, 4);
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function toPick(entity: QlooEntity, kind: PickKind): Pick {
  return {
    name: entity.name,
    kind,
    affinity: entity.query?.affinity ?? entity.popularity,
    description: entity.properties?.short_description ?? entity.properties?.description,
    imageUrl: entity.properties?.image?.url,
  };
}

export async function buildPreviewReport(input: HustleInput): Promise<HustleReport> {
  const opts = { mock: true };
  const calls: QlooCallRecord[] = [];
  const steps: AgentStep[] = [];
  const track = async <T>(promise: Promise<QlooResult<T>>): Promise<{ data: T; index: number }> => {
    const result = await promise;
    calls.push(result.call);
    return { data: result.data, index: calls.length - 1 };
  };

  // 1–2. Keywords → Qloo tags and comparable brands
  const keywords = extractKeywords(input.idea, input.city);
  const [tagResults, search] = await Promise.all([
    Promise.all(keywords.map((k) => track(findTags(k, { take: 3, ...opts })))),
    track(searchEntities(keywords.join(" "), { types: ["urn:entity:brand"], take: 5, ...opts })),
  ]);
  // Qloo often has several tags with the same name (e.g. genre + category); keep one of each.
  const tags = [
    ...new Map(tagResults.flatMap((r) => r.data.results.tags).map((t) => [t.name, { id: t.id, name: t.name }])).values(),
  ].slice(0, 4);
  const tagIds = tags.map((t) => t.id);
  steps.push({
    title: "Understanding your idea",
    detail: `Matched “${keywords.join(", ") || input.idea}” to ${tags.length} Qloo taste tags and ${search.data.results.length} comparable brands.`,
    callIndexes: [...tagResults.map((r) => r.index), search.index],
  });

  // 3–5. Gen Z audience, city heatmap and partner picks (independent, so run in parallel)
  const signals = {
    "signal.interests.tags": tagIds,
    "signal.interests.entities": search.data.results.map((e) => e.entity_id),
    "signal.demographics.age": GEN_Z_AGE,
  };
  const [brands, heatmap, artists, podcasts, places] = await Promise.all([
    track(getInsights({ "filter.type": "urn:entity:brand", ...signals, take: 8 }, opts)),
    track(getInsights({ "filter.type": "urn:heatmap", "filter.location.query": input.city, ...signals }, opts)),
    track(getInsights({ "filter.type": "urn:entity:artist", ...signals, take: 4 }, opts)),
    track(getInsights({ "filter.type": "urn:entity:podcast", ...signals, take: 3 }, opts)),
    track(
      getInsights({ "filter.type": "urn:entity:place", "filter.location.query": input.city, ...signals, take: 3 }, opts),
    ),
  ]);

  const comparableBrands = (brands.data.results.entities ?? []).slice(0, 5).map((e) => toPick(e, "brand"));
  steps.push({
    title: "Measuring Gen Z appetite",
    detail: `Scored ${comparableBrands.length} comparable brands for 18–24 year olds.`,
    callIndexes: [brands.index],
  });

  const neighbourhoods = labelNeighbourhoods(heatmap.data.results.heatmap ?? [], input.city);
  steps.push({
    title: `Mapping demand across ${input.city}`,
    detail: `Read ${heatmap.data.results.heatmap?.length ?? 0} heatmap cells; ${neighbourhoods[0]?.name ?? "no area"} over-indexes most.`,
    callIndexes: [heatmap.index],
  });

  const partners = [
    ...(artists.data.results.entities ?? []).map((e) => toPick(e, "artist")),
    ...(podcasts.data.results.entities ?? []).map((e) => toPick(e, "podcast")),
    ...(places.data.results.entities ?? []).map((e) => toPick(e, "place")),
  ].sort((a, b) => b.affinity - a.affinity);
  steps.push({
    title: "Finding collab partners",
    detail: `Ranked ${partners.length} artists, podcasts and venues by taste affinity.`,
    callIndexes: [artists.index, podcasts.index, places.index],
  });

  // 6. PulseScore
  const subScores = computeSubScores({
    brandAffinities: comparableBrands.map((b) => b.affinity),
    neighbourhoodAffinities: neighbourhoods.map((n) => n.affinity),
    partnerAffinities: partners.map((p) => p.affinity),
  });
  const pulseScore = computePulseScore(subScores);
  steps.push({
    title: "Calculating your PulseScore",
    detail: `Weighted audience fit, location demand and partner strength into a score of ${pulseScore}.`,
    callIndexes: [],
  });

  // 7. Launch plan (templated in preview; the agent will write this with Gemini).
  // Lead with the keywords Qloo recognised best, e.g. "jollof" over "late".
  const ranked = keywords
    .map((k, i) => ({ k, hits: tagResults[i].data.results.tags.length }))
    .sort((a, b) => b.hits - a.hits)
    .map((x) => x.k);
  const k1 = capitalise(ranked[0] ?? "Hustle");
  const k2 = capitalise(ranked[1] ?? "Club");
  const topHoods = neighbourhoods.slice(0, 3);
  const pickOf = (kind: PickKind) => partners.find((p) => p.kind === kind);
  const plan: HustleReport["plan"] = {
    headline: `Launch in ${topHoods[0]?.name ?? input.city} first, where the taste for ${k1.toLowerCase()} runs hottest.`,
    where: topHoods.map((n, i) => ({
      neighbourhood: n.name,
      why: `${i === 0 ? "Highest" : i === 1 ? "Second-highest" : "Third-highest"} Gen Z affinity in ${input.city} (${Math.round(n.affinity * 100)}/100 across ${n.cells} map cells).`,
    })),
    collabs: (["artist", "podcast", "place"] as const)
      .map((kind) => pickOf(kind))
      .filter((p): p is Pick => Boolean(p))
      .map((p) => ({
        name: p.name,
        kind: p.kind,
        idea:
          p.kind === "artist"
            ? `Pitch a playlist or styling collab — ${Math.round(p.affinity * 100)}% affinity with your audience.`
            : p.kind === "podcast"
              ? `Offer a listener discount code or guest spot.`
              : `Ask about a weekend pop-up or flyer spot.`,
      })),
    names: [`${k1} Pulse`, `The ${k1} Drop`, `${input.city} ${k2} Co.`, `${k1}${k2}`].filter(
      (n, i, all) => all.indexOf(n) === i,
    ),
    checklist: [
      { week: 1, task: `Visit ${topHoods[0]?.name ?? input.city} and talk to 10 potential customers.` },
      { week: 1, task: "Set up an Instagram and TikTok page with your chosen name." },
      { week: 2, task: `Reach out to ${pickOf("place")?.name ?? "one local venue"} about a pop-up slot.` },
      { week: 3, task: `Run your first pop-up in ${topHoods[0]?.name ?? input.city}; track sales and DMs.` },
      { week: 4, task: `Test a second spot in ${topHoods[1]?.name ?? "a nearby area"} and compare results.` },
    ],
  };

  return {
    input,
    generatedAt: new Date().toISOString(),
    source: "preview",
    usedMockData: calls.some((c) => c.mock),
    tags,
    pulseScore,
    subScores,
    neighbourhoods,
    comparableBrands,
    partners,
    plan,
    steps,
    calls,
    benchmark: {
      illustrative: true,
      rows: [
        { metric: "Names real local places", qloo: 92, llmOnly: 41 },
        { metric: "Gen Z-specific picks", qloo: 88, llmOnly: 52 },
        { metric: "Ranks neighbourhoods", qloo: 95, llmOnly: 30 },
        { metric: "Cites evidence", qloo: 100, llmOnly: 12 },
      ],
    },
  };
}
