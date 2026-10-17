/**
 * Saved reports, so a share link shows the exact same result instead of re-running the agent.
 * Uses Upstash Redis (added through the Vercel Marketplace). Without it configured,
 * saving is skipped and share links fall back to re-running the check.
 */
import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";
import type { HustleReport } from "./report";

const TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const ID_PATTERN = /^[A-Za-z0-9]{10}$/;

// Env var names vary: a direct setup uses KV_REST_API_* or UPSTASH_REDIS_REST_*, while
// the Vercel Marketplace integration prefixes them with the store name
// (e.g. hustlepulseredis_KV_REST_API_URL). Match by suffix so any of them work.
function findEnv(suffixes: string[]): string | undefined {
  for (const [key, value] of Object.entries(process.env)) {
    if (value && suffixes.some((s) => key === s || key.endsWith(`_${s}`))) return value;
  }
  return undefined;
}

const url = findEnv(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"]);
const token = findEnv(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"]);
const redis = url && token ? new Redis({ url, token }) : null;

export function storeAvailable(): boolean {
  return redis !== null;
}

function newId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  return [...randomBytes(10)].map((b) => alphabet[b % alphabet.length]).join("");
}

/** Save a finished report; returns its ID, or null if storage is off or fails. */
export async function saveReport(report: HustleReport): Promise<string | null> {
  if (!redis) return null;
  const id = newId();
  try {
    await redis.set(`report:${id}`, { ...report, id }, { ex: TTL_SECONDS });
    return id;
  } catch (err) {
    console.error("Could not save report", err);
    return null;
  }
}

export async function loadReport(id: string): Promise<HustleReport | null> {
  if (!redis || !ID_PATTERN.test(id)) return null;
  try {
    return await redis.get<HustleReport>(`report:${id}`);
  } catch (err) {
    console.error("Could not load report", err);
    return null;
  }
}
