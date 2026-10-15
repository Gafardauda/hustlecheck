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
  "PulseScore = 40% Audience fit + 35% Location demand + 25% Partner strength";

const mean = (values: number[]) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
const topN = (values: number[], n: number) => [...values].sort((a, b) => b - a).slice(0, n);
const toScore = (affinity: number) => Math.round(Math.max(0, Math.min(1, affinity)) * 100);

/**
 * Audience fit: mean Gen Z affinity of the top 5 comparable brands.
 * Location demand: mean affinity of the top 3 neighbourhoods in the city heatmap.
 * Partner strength: mean affinity of the top 5 partner picks.
 */
export function computeSubScores(input: {
  brandAffinities: number[];
  neighbourhoodAffinities: number[];
  partnerAffinities: number[];
}): SubScore[] {
  const audience = toScore(mean(topN(input.brandAffinities, 5)));
  const location = toScore(mean(topN(input.neighbourhoodAffinities, 3)));
  const partners = toScore(mean(topN(input.partnerAffinities, 5)));
  return [
    {
      key: "audience",
      label: "Audience fit",
      score: audience,
      weight: WEIGHTS.audience,
      evidence: `Mean Gen Z affinity of the top ${Math.min(5, input.brandAffinities.length)} comparable brands`,
    },
    {
      key: "location",
      label: "Location demand",
      score: location,
      weight: WEIGHTS.location,
      evidence: `Mean heatmap affinity of the top ${Math.min(3, input.neighbourhoodAffinities.length)} neighbourhoods`,
    },
    {
      key: "partners",
      label: "Partner strength",
      score: partners,
      weight: WEIGHTS.partners,
      evidence: `Mean affinity of the top ${Math.min(5, input.partnerAffinities.length)} partner picks`,
    },
  ];
}

export function computePulseScore(subScores: SubScore[]): number {
  return Math.round(subScores.reduce((sum, s) => sum + s.score * s.weight, 0));
}

export function scoreVerdict(score: number): { label: string; tone: "strong" | "promising" | "weak" } {
  if (score >= 75) return { label: "Strong pulse", tone: "strong" };
  if (score >= 55) return { label: "Promising pulse", tone: "promising" };
  return { label: "Weak pulse", tone: "weak" };
}
