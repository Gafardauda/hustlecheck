/**
 * The HustleReport is everything the screens need for one hustle check.
 * The preview builder (lib/preview-report.ts) produces it today; the Gemini agent
 * will produce the same shape, so the UI doesn't change when the agent lands.
 */
import type { NeighbourhoodDemand, QlooCallRecord } from "./qloo";

export const CITIES = ["Lagos", "London", "Accra"] as const;
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

export interface AgentStep {
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

export interface HustleReport {
  input: HustleInput;
  generatedAt: string;
  /** "preview" = keyword matching + sample data; "agent" = Gemini agent. */
  source: "preview" | "agent";
  /** True when any Qloo call used sample data instead of the live API. */
  usedMockData: boolean;
  tags: { id: string; name: string }[];
  pulseScore: number;
  subScores: SubScore[];
  neighbourhoods: NeighbourhoodDemand[];
  comparableBrands: Pick[];
  partners: Pick[];
  plan: LaunchPlan;
  steps: AgentStep[];
  calls: QlooCallRecord[];
  benchmark: { rows: BenchmarkRow[]; illustrative: boolean };
}
