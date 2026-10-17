/**
 * Best-city comparison: for one idea + audience, measure demand in every city
 * and rank them. Uses one Qloo heatmap per city (no LLM), so it's fast and free.
 */
import { cityQuery, findTags, getInsights, labelNeighbourhoods } from "./qloo";
import { extractKeywords } from "./preview-report";
import { audience, CITIES, type AudienceKey, type City } from "./report";

export interface CityDemand {
  city: City;
  /** 0–100: mean affinity of the city's top-5 neighbourhoods for this idea. */
  score: number;
  topNeighbourhood?: string;
  cells: number;
}

export interface CompareResult {
  tags: { id: string; name: string }[];
  ranking: CityDemand[];
}

export async function compareCities(idea: string, audienceKey: AudienceKey): Promise<CompareResult> {
  const keywords = extractKeywords(idea, "");
  const tagResults = await Promise.all(
    (keywords.length ? keywords : [idea.slice(0, 40)]).map((k) => findTags(k, { take: 5 })),
  );
  const all = tagResults.flatMap((r) => r.data.results.tags);
  // Heatmaps use place tags; prefer those, then dedupe by name and keep up to 4.
  const place = all.filter((t) => t.parents?.some((p) => p.type === "urn:entity:place"));
  const chosen = [...new Map((place.length ? place : all).map((t) => [t.name.toLowerCase(), t])).values()].slice(0, 4);
  const tagIds = chosen.map((t) => t.id);
  const age = audience(audienceKey).age;

  const ranking = await Promise.all(
    CITIES.map(async (city): Promise<CityDemand> => {
      const r = await getInsights({
        "filter.type": "urn:heatmap",
        "filter.location.query": cityQuery(city),
        "signal.interests.tags": tagIds,
        "signal.demographics.age": age,
      });
      const heatmap = r.data.results.heatmap ?? [];
      const hoods = labelNeighbourhoods(heatmap, city);
      const top5 = hoods.slice(0, 5);
      const score = top5.length ? Math.round((top5.reduce((s, n) => s + n.affinity, 0) / top5.length) * 100) : 0;
      return { city, score, topNeighbourhood: hoods[0]?.name, cells: heatmap.length };
    }),
  );
  ranking.sort((a, b) => b.score - a.score);
  return { tags: chosen.map((t) => ({ id: t.id, name: t.name })), ranking };
}
