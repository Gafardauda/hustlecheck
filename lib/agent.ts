/**
 * The HustlePulse agent: Gemini decides what to look up, Qloo measures it.
 *
 * Phase 1 (tool loop): Gemini calls research_idea to turn the idea into real Qloo
 * tags and comparable brands (it can retry with better keywords), then calls
 * analyze_market with the most relevant tags.
 * Phase 2: Gemini writes the launch plan as structured output from the evidence.
 * The PulseScore itself is computed in code (lib/score.ts), never by the LLM.
 */
import { google } from "@ai-sdk/google";
import { generateText, hasToolCall, Output, stepCountIs, tool } from "ai";
import { z } from "zod";
import {
  analyzeMarket,
  assembleReport,
  groundPlan,
  researchIdea,
  scoreMarket,
  templatePlan,
  type MarketResult,
  type Run,
} from "./pipeline";
import type { HustleReport } from "./report";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

export function agentAvailable(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}

const INSTRUCTIONS = `You are HustlePulse, an agent that checks whether a Gen Z side hustle has real local demand, using Qloo's taste graph.

Work in this order:
1. Call research_idea once with:
   - 2–4 short keywords that Qloo is likely to have as taste tags (nouns like "thrift store", "streetwear", "jollof", "nail salon", "bubble tea" — not adjectives or words like "delivery" or "students"),
   - 2–4 well-known brands these customers would already love,
   - 1–2 artists who are popular with 18–24 year olds in the city right now (for example Nigerian artists for Lagos).
2. If research_idea finds fewer than 2 relevant tags, call it again with different keywords (max 2 retries).
3. Call analyze_market once with 2–4 tag IDs copied exactly from research_idea results — the most relevant to the idea, preferring tags that apply to "place" — and the brand IDs it found.
Do not invent tag IDs, brands, places or numbers.`;

const planSchema = z.object({
  headline: z.string().describe("One punchy sentence: where to launch first and why, citing the data."),
  where: z
    .array(z.object({ neighbourhood: z.string(), why: z.string().describe("Cite the affinity number.") }))
    .describe("The top 4–5 neighbourhoods, copied exactly from the evidence."),
  collabs: z
    .array(
      z.object({
        name: z.string().describe("Copied exactly from the partner evidence."),
        kind: z.enum(["artist", "podcast", "place", "brand"]),
        idea: z.string().describe("A specific, cheap collab idea for a student budget."),
      }),
    )
    .describe("3 partners: ideally one artist, one podcast and one venue."),
  names: z.array(z.string()).describe("4 catchy Gen Z business names that fit the city."),
  checklist: z
    .array(z.object({ week: z.number().int().min(1).max(4), task: z.string() }))
    .describe("6–8 concrete first-month tasks across weeks 1–4, naming real places and partners from the evidence."),
});

export async function runAgent(run: Run): Promise<HustleReport> {
  const model = google(GEMINI_MODEL);
  let market: MarketResult | null = null;
  let usedTagIds: string[] = [];
  let keywordsUsed: string[] = [];

  // Phase 1: tool loop
  await generateText({
    model,
    system: INSTRUCTIONS,
    prompt: `Hustle idea: "${run.input.idea}"\nCity: ${run.input.city}${run.input.budget ? `\nBudget: ${run.input.budget}` : ""}`,
    // Gemini must call a tool every step (it sometimes answers in text instead),
    // and the loop stops as soon as the market analysis has run; the plan is phase 2.
    toolChoice: "required",
    stopWhen: [hasToolCall("analyze_market"), stepCountIs(6)],
    tools: {
      research_idea: tool({
        description: "Look up Qloo taste tags for keywords and resolve comparable brand names to Qloo IDs.",
        inputSchema: z.object({
          keywords: z.array(z.string()).min(1).max(4),
          comparableBrands: z.array(z.string()).max(4),
          localArtists: z.array(z.string()).max(2).describe("Artists popular with Gen Z in the city"),
        }),
        execute: async ({ keywords, comparableBrands, localArtists }) => {
          keywordsUsed = keywords;
          const r = await researchIdea(run, keywords, comparableBrands, localArtists);
          return {
            tags: r.tags.slice(0, 15),
            brands: r.brands,
            localArtists: r.artists.map((a) => a.name),
            keywordsWithNoTags: r.emptyKeywords,
            brandsNotFound: r.missingBrands,
          };
        },
      }),
      analyze_market: tool({
        description:
          "Measure Gen Z demand: comparable-brand affinity, a city heatmap by neighbourhood, and partner picks (artists, podcasts, venues).",
        inputSchema: z.object({
          tagIds: z.array(z.string()).min(1).max(4),
          brandIds: z.array(z.string()).max(4),
        }),
        execute: async ({ tagIds, brandIds }) => {
          const valid = tagIds.filter((id) => run.knownTags.has(id));
          if (!valid.length) {
            return { error: "None of those tag IDs came from research_idea. Copy IDs exactly from its results." };
          }
          if (market) return { error: "analyze_market already ran for this check." };
          usedTagIds = valid;
          market = await analyzeMarket(run, valid, brandIds);
          return summarise(market);
        },
      }),
    },
  });

  // If the model never got as far as analyze_market, finish the pipeline ourselves.
  if (!market) {
    run.notes.push("The agent stopped early, so HustlePulse picked the taste tags automatically.");
    usedTagIds = [...run.knownTags.keys()].slice(0, 4);
    if (!usedTagIds.length) throw new Error("No Qloo taste tags matched this idea.");
    market = await analyzeMarket(run, usedTagIds, [...run.knownBrands.keys()].slice(0, 4));
  }
  const finalMarket: MarketResult = market;
  const score = scoreMarket(run, finalMarket);

  // Phase 2: launch plan as structured output, grounded in the evidence
  const fallback = templatePlan(run.input, finalMarket, keywordsUsed);
  let plan = fallback;
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: planSchema }),
      system:
        "You write short, practical launch plans for Gen Z side hustles. Use only the places, partners and numbers in the evidence. Write in plain, upbeat English.",
      prompt: JSON.stringify({
        idea: run.input.idea,
        city: run.input.city,
        budget: run.input.budget ?? "not given",
        pulseScore: score.pulseScore,
        evidence: summarise(finalMarket),
      }),
    });
    plan = groundPlan(output, finalMarket, fallback);
    run.step("plan", "Wrote a launch plan that cites the Qloo evidence.");
  } catch (err) {
    console.error("Plan generation failed; using template", err);
    run.notes.push("The launch plan was built from a template because the AI writer was unavailable.");
    run.step("plan", "Built a launch plan from the Qloo results.");
  }

  return assembleReport(run, { source: "agent", model: GEMINI_MODEL, market: finalMarket, score, plan, usedTagIds });
}

/** Compact evidence for the model: names and 0–100 affinities only. */
function summarise(market: MarketResult) {
  const pct = (v: number) => Math.round(v * 100);
  return {
    comparableBrands: market.comparableBrands.map((b) => ({ name: b.name, genZAffinity: pct(b.affinity) })),
    neighbourhoods: market.neighbourhoods
      .slice(0, 8)
      .map((n) => ({ name: n.name, affinity: pct(n.affinity), heatmapCells: n.cells })),
    partners: market.partners.slice(0, 10).map((p) => ({ name: p.name, kind: p.kind, affinity: pct(p.affinity) })),
  };
}
