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

/**
 * Cities where Qloo's podcast catalogue localises acceptably — it's US-centric,
 * so elsewhere we hide the podcast picks rather than show US names (David Dobrik,
 * Logan Paul) to a Lagos founder. See analyzeMarket in lib/pipeline.ts.
 */
export const PODCAST_CITIES: readonly City[] = ["New York"];
export function podcastsLocalise(city: City): boolean {
  return PODCAST_CITIES.includes(city);
}

/**
 * Cities where Qloo's brand graph returns genuinely local/on-theme brands (tested:
 * London → Palace, Dr. Martens, Off-White). For other cities Qloo under-indexes local
 * brands and returns global fashion houses, so we label those picks honestly as global
 * rather than implying they're local. See analyzeMarket in lib/pipeline.ts.
 */
export const BRAND_LOCAL_CITIES: readonly City[] = ["New York", "London", "Toronto"];
export function brandsLocalise(city: City): boolean {
  return BRAND_LOCAL_CITIES.includes(city);
}

export const BUDGETS = ["Under $100", "$100–500", "$500–2,000", "$2,000+"] as const;

/**
 * Target audiences, mapped to Qloo age brackets (comma-combined; `age: undefined`
 * means no age signal). `crowd` is a plain plural used in copy.
 */
export const AUDIENCES = [
  { key: "genz", label: "Gen Z", long: "Gen Z (18–29)", crowd: "Gen Z", age: "24_and_younger,25_to_29" },
  { key: "young", label: "Under 25", long: "Under 25", crowd: "under-25s", age: "24_and_younger" },
  { key: "millennials", label: "Millennials", long: "Millennials (25–40)", crowd: "millennials", age: "25_to_29,30_to_34,35_to_44" },
  { key: "everyone", label: "All adults", long: "All adults", crowd: "adults", age: undefined },
] as const;

export type AudienceKey = (typeof AUDIENCES)[number]["key"];

export function audience(key: AudienceKey | undefined): (typeof AUDIENCES)[number] {
  return AUDIENCES.find((a) => a.key === key) ?? AUDIENCES[0];
}

export interface HustleInput {
  idea: string;
  city: City;
  budget?: string;
  /** Target audience key; defaults to Gen Z. */
  audience: AudienceKey;
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
export const STEP_KEYS = ["idea", "audience", "location", "partners", "taste", "score", "plan"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export function stepTitle(key: StepKey, city: string): string {
  return {
    idea: "Getting your idea",
    audience: "Checking who's into it",
    location: `Finding your hotspots in ${city}`,
    partners: "Picking your collab squad",
    taste: "Reading their taste DNA",
    score: "Scoring the demand",
    plan: "Building your game plan",
  }[key];
}

/** One entity in a cross-domain taste profile. */
export interface TasteItem {
  name: string;
  affinity: number;
  imageUrl?: string;
}

/** A domain of the customer's taste (films, shows, games…) with its top matches. */
export interface TasteDomain {
  key: string;
  label: string;
  emoji: string;
  items: TasteItem[];
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
  /** True when Qloo had no city-specific brand data, so comparableBrands are global picks. */
  brandsGlobal?: boolean;
  partners: Pick[];
  /** Cross-domain taste profile of the target customer (Qloo's signature strength). */
  tasteDNA: TasteDomain[];
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
