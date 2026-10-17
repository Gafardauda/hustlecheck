/**
 * Measured benchmark results, shown on the "Why trust this" tab.
 * The numbers in benchmark.json come from scripts run offline (not committed):
 * each sample idea is run through HustlePulse (Qloo + AI) and the same AI with no
 * Qloo, and every pick is verified against Qloo's taste graph. Only the aggregate
 * percentages are stored here — never raw Qloo responses.
 */
import type { Benchmark } from "./report";
import data from "./benchmark.json";

export const BENCHMARK: Benchmark = { ...data, illustrative: false };
