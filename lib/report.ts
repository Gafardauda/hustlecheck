/**
 * The HustleReport is everything the screens need for one hustle check.
 * Both the Gemini agent (lib/agent.ts) and the keyword-matching fallback
 * (lib/preview-report.ts) produce it, so the UI doesn't care which one ran.
 */
import type { NeighbourhoodDemand, QlooCallRecord } from "./qloo";

export const CITIES = [
  "Lagos",
  "Abuja",
  "Ibadan",
  "Accra",
  "Nairobi",
  "Cape Town",
  "London",
  "New York",
  "Toronto",
] as const;
export type City = (typeof CITIES)[number];

export const BUDGETS = ["Under $100", "$100–500", "$500–2,000", "$2,000+"] as const;

export interface HustleInput {
  idea: string;
  city: City;
  budget?: string;
}

export type SubScoreKey = "audience" | "location" | "partners";

export interface SubScore {
  key: SubScoreKey;
  label: string;
  /** 0–100 */
  score: number;
  /** Share of the PulseScore, e.g. 0.4 */
  weight: number;
  /** One line explaining where the number came from. */
  evidence: string;
}

export type PickKind = "brand" | "artist" | "podcast" | "place";

export interface Pick {
  name: string;
  kind: PickKind;
  /** Qloo affinity, 0–1 */
  affinity: number;
  description?: string;
  imageUrl?: string;
}

/** The fixed stages of a hustle check, in display order. */
export const STEP_KEYS = ["idea", "audience", "location", "partners", "score", "plan"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export function stepTitle(key: StepKey, city: string): string {
  return {
    idea: "Getting your idea",
    audience: "Checking who's into it",
    location: `Finding your hotspots in ${city}`,
    partners: "Picking your collab squad",
    score: "Scoring the demand",
    plan: "Building your game plan",
  }[key];
}

export interface AgentStep {
  key: StepKey;
  title: string;
  detail: string;
  /** Index into HustleReport.calls for the Qloo calls this step made. */
  callIndexes: number[];
}

export interface LaunchPlan {
  headline: string;
  where: { neighbourhood: string; why: string }[];
  collabs: { name: string; kind: PickKind; idea: string }[];
  names: string[];
  checklist: { week: number; task: string }[];
}

export interface BenchmarkRow {
  metric: string;
  qloo: number;
  llmOnly: number;
}

export interface Benchmark {
  rows: BenchmarkRow[];
  /** True = placeholder numbers; false = measured results from the benchmark run. */
  illustrative: boolean;
  /** Present when measured: how and when the benchmark was run. */
  generatedAt?: string;
  ideas?: number;
  cities?: number;
  model?: string;
  method?: string;
}

export interface HustleReport {
  /** Share ID, set once the report is saved (see lib/store.ts). */
  id?: string;
  input: HustleInput;
  generatedAt: string;
  /** "agent" = Gemini agent; "preview" = keyword matching (no LLM). */
  source: "agent" | "preview";
  /** Gemini model used, when source is "agent". */
  model?: string;
  /** True when any Qloo call used sample data instead of the live API. */
  usedMockData: boolean;
  /** Plain-language notes about fallbacks, shown on the "Why trust this" tab. */
  notes: string[];
  tags: { id: string; name: string }[];
  pulseScore: number;
  subScores: SubScore[];
  neighbourhoods: NeighbourhoodDemand[];
  comparableBrands: Pick[];
  partners: Pick[];
  plan: LaunchPlan;
  steps: AgentStep[];
  calls: QlooCallRecord[];
  benchmark: Benchmark;
}

/** Events streamed from /api/check to the browser, one JSON object per line. */
export type CheckEvent =
  | { type: "step"; step: AgentStep }
  | { type: "call"; index: number; call: QlooCallRecord }
  | { type: "report"; report: HustleReport }
  | { type: "error"; message: string };
