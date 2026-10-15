/**
 * Fallback hustle check without the LLM: simple keyword matching drives the
 * same Qloo pipeline the agent uses, and the plan comes from a template.
 * Used when Gemini isn't configured or fails.
 */
import { analyzeMarket, assembleReport, researchIdea, type Run, scoreMarket, templatePlan } from "./pipeline";
import type { HustleReport } from "./report";

const STOPWORDS = new Set(
  "a an and the for of to in on at with by from my our your their this that into near selling sell sells business hustle side idea shop store start starting students student young people gen genz online offline small local city late night home based delivery service services"
    .split(" "),
);

export function extractKeywords(idea: string, city: string): string[] {
  const words = idea
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w) && w !== city.toLowerCase());
  return [...new Set(words)].slice(0, 4);
}

/**
 * Best tag per keyword: its name must contain the keyword, and genre/category
 * place tags beat descriptive ones (e.g. "nail" → "Nail salon", not "Nail art decor").
 */
function pickTags(keywords: string[], tags: { id: string; name: string }[]): string[] {
  const rank = (id: string) => (/^urn:tag:(genre|category):place:/.test(id) ? 0 : /:place:/.test(id) ? 1 : 2);
  const picked = keywords
    .map((k) =>
      tags.filter((t) => t.name.toLowerCase().includes(k)).sort((a, b) => rank(a.id) - rank(b.id))[0],
    )
    .filter((t): t is { id: string; name: string } => Boolean(t));
  const ids = [...new Set(picked.map((t) => t.id))];
  // If no tag names contain a keyword, fall back to Qloo's first results.
  return (ids.length ? ids : tags.map((t) => t.id)).slice(0, 4);
}

export async function buildPreviewReport(run: Run): Promise<HustleReport> {
  const keywords = extractKeywords(run.input.idea, run.input.city);
  const research = await researchIdea(run, keywords.length ? keywords : [run.input.idea.slice(0, 40)], []);
  const tagIds = pickTags(keywords, research.tags);
  if (!tagIds.length) throw new Error("No Qloo taste tags matched this idea.");
  const market = await analyzeMarket(run, tagIds, []);
  const score = scoreMarket(run, market);

  // Lead the template with keywords Qloo recognised (e.g. "jollof" before "delivery").
  const ranked = [...keywords].sort(
    (a, b) => Number(research.emptyKeywords.includes(a)) - Number(research.emptyKeywords.includes(b)),
  );
  const plan = templatePlan(run.input, market, ranked);
  run.step("plan", "Built a launch plan from the Qloo results.");

  return assembleReport(run, { source: "preview", market, score, plan, usedTagIds: tagIds });
}
