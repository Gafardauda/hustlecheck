/**
 * PulseScore (0–100): a transparent weighted average of three Qloo-derived sub-scores.
 * The formula is shown in the UI, so keep the text and the maths in sync.
 */
import type { SubScore, SubScoreKey } from "./report";

export const WEIGHTS: Record<SubScoreKey, number> = {
  audience: 0.4,
  location: 0.35,
  partners: 0.25,
};

export const FORMULA_TEXT =
  "Your score blends who wants it (40%), where they are (35%) and who you can collab with (25%).";

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
const topN = (values: number[], n: number) => [...values].sort((a, b) => b - a).slice(0, n);
const toScore = (affinity: number) => Math.round(Math.max(0, Math.min(1, affinity)) * 100);

/**
 * Audience fit: mean Gen Z affinity of the top 5 comparable brands.
 * Location demand: mean affinity of the top 5 neighbourhoods in the city heatmap.
 * Partner strength: mean affinity of the top 5 partner picks.
 */
export function computeSubScores(input: {
  brandAffinities: number[];
  neighbourhoodAffinities: number[];
  partnerAffinities: number[];
}): SubScore[] {
  const audience = toScore(mean(topN(input.brandAffinities, 5)));
  const location = toScore(mean(topN(input.neighbourhoodAffinities, 5)));
  const partners = toScore(mean(topN(input.partnerAffinities, 5)));
  return [
    {
      key: "audience",
      label: "Who wants it",
      score: audience,
      weight: WEIGHTS.audience,
      evidence: "How much 18–24s love brands like yours",
    },
    {
      key: "location",
      label: "Where they are",
      score: location,
      weight: WEIGHTS.location,
      evidence: "How hot the demand is in your best areas",
    },
    {
      key: "partners",
      label: "Who to collab with",
      score: partners,
      weight: WEIGHTS.partners,
      evidence: "How well your collab picks match the vibe",
    },
  ];
}

export function computePulseScore(subScores: SubScore[]): number {
  return Math.round(subScores.reduce((sum, s) => sum + s.score * s.weight, 0));
}

export interface Verdict {
  label: string;
  emoji: string;
  tone: "strong" | "promising" | "weak";
  /** A hype line for the scorecard, naming the city. */
  blurb: string;
}

export function scoreVerdict(score: number, city = "your city"): Verdict {
  if (score >= 75)
    return { label: "Strong pulse", emoji: "🔥", tone: "strong", blurb: `${city} is hungry for this.` };
  if (score >= 55)
    return { label: "Promising pulse", emoji: "⚡", tone: "promising", blurb: `Real demand in ${city} — play it smart.` };
  return { label: "Early days", emoji: "🌱", tone: "weak", blurb: `Niche in ${city} for now. Start small and test.` };
}
