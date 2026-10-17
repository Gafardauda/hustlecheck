/**
 * Qloo API client (server-side only — never import this into a client component,
 * it reads QLOO_API_KEY).
 *
 * Wraps the three hackathon endpoints:
 *   GET /search        → resolve names to Qloo entity IDs
 *   GET /v2/tags       → find tag IDs (cuisines, styles, genres) by keyword
 *   GET /v2/insights   → taste insights, demographics, heatmaps
 *
 * Set USE_MOCK_QLOO=true to return realistic sample data instead of calling Qloo.
 * Every call returns { data, call } so the UI can show a trace of each Qloo request.
 */

// ---------------------------------------------------------------------------
// Types (checked against live hackathon responses on 2026-10-15; extra fields are allowed)
// ---------------------------------------------------------------------------

export type QlooEntityType =
  | "urn:entity:artist"
  | "urn:entity:book"
  | "urn:entity:brand"
  | "urn:entity:destination"
  | "urn:entity:movie"
  | "urn:entity:person"
  | "urn:entity:place"
  | "urn:entity:podcast"
  | "urn:entity:tv_show"
  | "urn:entity:video_game";

export type QlooInsightType = QlooEntityType | "urn:heatmap" | "urn:demographics";

/** A tag as returned by /v2/tags. */
export interface QlooTag {
  id: string; // e.g. "urn:tag:genre:place:thrift_store"
  name: string;
  type: string; // e.g. "urn:tag:genre:place"
  /** Entity types the tag applies to, e.g. [{ type: "urn:entity:place" }]. */
  parents?: { type: string }[];
  popularity?: number;
}

/** A tag as embedded in an entity (uses `tag_id`, not `id`). */
export interface QlooEntityTag {
  tag_id: string;
  name: string;
  type: string;
  value?: string;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  /** /search returns `types`; /v2/insights returns `type: "urn:entity"` plus `subtype`. */
  types?: QlooEntityType[];
  type?: string;
  subtype?: string;
  popularity: number; // 0–1 percentile
  disambiguation?: string;
  properties?: {
    short_description?: string;
    description?: string;
    address?: string;
    image?: { url: string };
    [key: string]: unknown;
  };
  location?: { lat: number; lon: number; geohash?: string };
  tags?: QlooEntityTag[];
  /** Present on /v2/insights results: how strongly the entity matches the signals. */
  query?: {
    affinity: number; // 0–1
    distance?: number;
    measurements?: { audience_growth?: number };
  };
}

/** Qloo heatmap cells carry coordinates only; use labelNeighbourhoods() to name them. */
export interface QlooHeatmapCell {
  location: { latitude: number; longitude: number; geohash: string };
  query: {
    affinity: number; // 0–1, how much this area over-indexes for the taste
    affinity_rank: number; // 0–1 percentile within the area
    popularity: number; // 0–1
    [key: string]: number; // per-signal breakdowns, e.g. entity_artist_affinity
  };
}

export interface QlooSearchResponse {
  results: QlooEntity[];
}

export interface QlooTagsResponse {
  success: boolean;
  results: { tags: QlooTag[] };
}

export interface QlooInsightsResponse {
  success: boolean;
  results: {
    entities?: QlooEntity[];
    heatmap?: QlooHeatmapCell[];
  };
  /** How Qloo resolved filter.location.query, e.g. "Lagos" → "Lagos, Nigeria". */
  query?: { localities?: { filter?: QlooEntity[] } };
  duration?: number;
}

/** One record per Qloo request, for the live trace and the "Why trust this" screen. */
export interface QlooCallRecord {
  endpoint: "/search" | "/v2/tags" | "/v2/insights";
  params: Record<string, string>;
  mock: boolean;
  ms: number;
  resultCount: number;
  ok: boolean;
  /** True when served from the server's in-memory cache (no network call made). */
  cached?: boolean;
  error?: string;
}

export interface QlooResult<T> {
  data: T;
  call: QlooCallRecord;
}

/** Query params as the agent passes them, e.g. { "filter.type": "urn:entity:brand", "take": 10 }. */
export type QlooParams = Record<string, string | number | boolean | string[] | undefined>;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function isMockMode(): boolean {
  return process.env.USE_MOCK_QLOO === "true" || !process.env.QLOO_API_KEY;
}

/** Per-call override: `mock: true` forces sample data even when a live key is set. */
export interface QlooCallOptions {
  mock?: boolean;
}

/** GET /search — resolve a name like "Nike" or "Burna Boy" to Qloo entities. */
export function searchEntities(
  query: string,
  opts: { types?: QlooEntityType[]; take?: number } & QlooCallOptions = {},
): Promise<QlooResult<QlooSearchResponse>> {
  const params: QlooParams = { query, types: opts.types, take: opts.take ?? 5 };
  return request("/search", params, (p) => mockSearch(p), (d) => d.results.length, opts);
}

/** GET /v2/tags — find tag IDs by keyword, e.g. "thrift" or "jollof". */
export function findTags(
  query: string,
  opts: { take?: number } & QlooCallOptions = {},
): Promise<QlooResult<QlooTagsResponse>> {
  const params: QlooParams = { "filter.query": query, take: opts.take ?? 5 };
  return request("/v2/tags", params, (p) => mockTags(p), (d) => d.results.tags.length, opts);
}

/**
 * GET /v2/insights — the main endpoint. `filter.type` is required.
 * Pass Qloo's dotted param names directly, for example:
 *   { "filter.type": "urn:heatmap", "filter.location.query": "Lagos",
 *     "signal.interests.tags": ["urn:tag:genre:place:streetwear"] }
 */
export function getInsights(
  params: QlooParams,
  opts: QlooCallOptions = {},
): Promise<QlooResult<QlooInsightsResponse>> {
  if (!params["filter.type"]) throw new Error("getInsights: 'filter.type' is required");
  return request(
    "/v2/insights",
    params,
    (p) => mockInsights(p),
    (d) => (d.results.entities?.length ?? 0) + (d.results.heatmap?.length ?? 0),
    opts,
  );
}

// ---------------------------------------------------------------------------
// Request plumbing (live + mock), with a small in-memory cache
// ---------------------------------------------------------------------------

const cache = new Map<string, unknown>();
const CACHE_LIMIT = 500;

function toQueryParams(params: QlooParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    out[key] = Array.isArray(value) ? value.join(",") : String(value);
  }
  return out;
}

// The hackathon key is rate limited: run at most MAX_CONCURRENT live calls at once,
// and retry a 429 (rate limit) or dropped connection after a short, growing wait.
const MAX_CONCURRENT = 3;
const RETRY_DELAYS_MS = [1200, 2500, 5000];
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

async function liveFetch(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const base = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
  const url = `${base}${endpoint}?${new URLSearchParams(params)}`;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await withSlot(() =>
        fetch(url, { headers: { "X-Api-Key": process.env.QLOO_API_KEY!, Accept: "application/json" } }),
      );
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 429 && attempt < RETRY_DELAYS_MS.length) {
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      continue;
    }
    throw new Error(`Qloo ${endpoint} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

async function request<T>(
  endpoint: QlooCallRecord["endpoint"],
  rawParams: QlooParams,
  mock: (params: Record<string, string>) => T,
  count: (data: T) => number,
  opts: QlooCallOptions = {},
): Promise<QlooResult<T>> {
  const params = toQueryParams(rawParams);
  const useMock = opts.mock ?? isMockMode();
  const started = Date.now();
  const call: QlooCallRecord = { endpoint, params, mock: useMock, ms: 0, resultCount: 0, ok: true };

  const cacheKey = `${useMock}:${endpoint}?${new URLSearchParams(params).toString()}`;
  if (cache.has(cacheKey)) {
    const data = cache.get(cacheKey) as T;
    return { data, call: { ...call, cached: true, resultCount: count(data) } };
  }

  try {
    let data: T;
    if (useMock) {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // feel like a network call
      data = mock(params);
    } else {
      data = (await liveFetch(endpoint, params)) as T;
    }
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(cacheKey, data);
    call.resultCount = count(data);
    return { data, call: { ...call, ms: Date.now() - started } };
  } catch (err) {
    call.ok = false;
    call.error = err instanceof Error ? err.message : String(err);
    call.ms = Date.now() - started;
    throw Object.assign(new Error(call.error), { call });
  }
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random numbers from a string seed, so mock results are stable. */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const fakeId = (name: string) => {
  const r = seeded(name);
  const hex = () => Math.floor(r() * 0xffff).toString(16).padStart(4, "0").toUpperCase();
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`;
};

interface MockSeed {
  name: string;
  type: QlooEntityType;
  description: string;
  keywords: string[];
  popularity: number;
}

const MOCK_ENTITIES: MockSeed[] = [
  // Brands
  { name: "Nike", type: "urn:entity:brand", description: "Athletic footwear and apparel", keywords: ["sneakers", "streetwear", "fitness", "fashion"], popularity: 0.99 },
  { name: "Off-White", type: "urn:entity:brand", description: "Luxury streetwear label", keywords: ["streetwear", "fashion", "sneakers"], popularity: 0.93 },
  { name: "Depop", type: "urn:entity:brand", description: "Peer-to-peer resale fashion app", keywords: ["thrift", "vintage", "resale", "fashion"], popularity: 0.88 },
  { name: "Vinted", type: "urn:entity:brand", description: "Second-hand clothing marketplace", keywords: ["thrift", "vintage", "resale"], popularity: 0.86 },
  { name: "Fenty Beauty", type: "urn:entity:brand", description: "Inclusive cosmetics brand", keywords: ["beauty", "makeup", "skincare"], popularity: 0.95 },
  { name: "The Ordinary", type: "urn:entity:brand", description: "Clinical skincare at accessible prices", keywords: ["skincare", "beauty"], popularity: 0.9 },
  { name: "Chowdeck", type: "urn:entity:brand", description: "Lagos food delivery app", keywords: ["food", "delivery", "jollof", "small chops"], popularity: 0.74 },
  { name: "Glovo", type: "urn:entity:brand", description: "On-demand delivery app", keywords: ["food", "delivery"], popularity: 0.85 },
  { name: "Canva", type: "urn:entity:brand", description: "Online design platform", keywords: ["design", "graphics", "content", "social media"], popularity: 0.94 },
  { name: "CapCut", type: "urn:entity:brand", description: "Short-form video editor", keywords: ["video", "content", "social media", "tiktok"], popularity: 0.92 },
  { name: "Boba Guys", type: "urn:entity:brand", description: "Bubble tea chain", keywords: ["bubble tea", "boba", "drinks", "cafe"], popularity: 0.71 },
  { name: "Gymshark", type: "urn:entity:brand", description: "Fitness apparel brand", keywords: ["fitness", "gym", "activewear"], popularity: 0.9 },
  { name: "Sorare", type: "urn:entity:brand", description: "Fantasy football with digital cards", keywords: ["gaming", "football", "sports"], popularity: 0.66 },
  // Artists
  { name: "Burna Boy", type: "urn:entity:artist", description: "Nigerian Afro-fusion artist", keywords: ["afrobeats", "music", "lagos"], popularity: 0.97 },
  { name: "Tems", type: "urn:entity:artist", description: "Nigerian alté and R&B singer", keywords: ["alte", "r&b", "music", "lagos"], popularity: 0.94 },
  { name: "Asake", type: "urn:entity:artist", description: "Nigerian Afrobeats and amapiano artist", keywords: ["afrobeats", "amapiano", "music"], popularity: 0.93 },
  { name: "Rema", type: "urn:entity:artist", description: "Nigerian Afrorave artist", keywords: ["afrobeats", "music", "gen z"], popularity: 0.95 },
  { name: "Ayra Starr", type: "urn:entity:artist", description: "Nigerian Afropop singer", keywords: ["afrobeats", "afropop", "music", "gen z"], popularity: 0.91 },
  { name: "Odunsi (The Engine)", type: "urn:entity:artist", description: "Lagos alté producer and singer", keywords: ["alte", "music", "streetwear"], popularity: 0.68 },
  { name: "Black Sherif", type: "urn:entity:artist", description: "Ghanaian drill and highlife artist", keywords: ["drill", "music", "accra"], popularity: 0.88 },
  { name: "Central Cee", type: "urn:entity:artist", description: "UK drill rapper", keywords: ["drill", "music", "london", "streetwear"], popularity: 0.94 },
  // Podcasts
  { name: "I Said What I Said", type: "urn:entity:podcast", description: "Nigerian pop culture conversations", keywords: ["culture", "lagos", "lifestyle"], popularity: 0.72 },
  { name: "Menisms", type: "urn:entity:podcast", description: "Nigerian podcast on men, culture and lifestyle", keywords: ["culture", "lifestyle", "lagos"], popularity: 0.65 },
  { name: "The Honest Bunch", type: "urn:entity:podcast", description: "Nigerian relationships and lifestyle podcast", keywords: ["lifestyle", "relationships"], popularity: 0.67 },
  { name: "Diary of a CEO", type: "urn:entity:podcast", description: "Entrepreneurship interviews", keywords: ["business", "entrepreneur", "hustle"], popularity: 0.96 },
  { name: "Earn Your Leisure", type: "urn:entity:podcast", description: "Financial literacy and business", keywords: ["business", "money", "hustle"], popularity: 0.84 },
  // Places
  { name: "Yaba Market", type: "urn:entity:place", description: "Open-air market, Yaba, Lagos", keywords: ["thrift", "okrika", "fashion", "market", "lagos"], popularity: 0.7 },
  { name: "Hard Rock Cafe Lagos", type: "urn:entity:place", description: "Restaurant and venue, Victoria Island, Lagos", keywords: ["food", "music", "lagos", "events"], popularity: 0.76 },
  { name: "Nike Art Gallery", type: "urn:entity:place", description: "Art gallery, Lekki, Lagos", keywords: ["art", "culture", "lagos"], popularity: 0.78 },
  { name: "Terra Kulture", type: "urn:entity:place", description: "Arts and culture centre, Victoria Island, Lagos", keywords: ["art", "culture", "events", "food", "lagos"], popularity: 0.73 },
  { name: "Ikeja City Mall", type: "urn:entity:place", description: "Shopping mall, Ikeja, Lagos", keywords: ["shopping", "fashion", "food", "lagos"], popularity: 0.8 },
  { name: "Osu Oxford Street", type: "urn:entity:place", description: "Shopping and nightlife strip, Accra", keywords: ["shopping", "food", "nightlife", "accra"], popularity: 0.77 },
  { name: "Brick Lane Market", type: "urn:entity:place", description: "Vintage and street food market, London", keywords: ["thrift", "vintage", "food", "market", "london"], popularity: 0.89 },
];

/** Mock tags use real IDs seen in live /v2/tags responses. */
const mockTag = (id: string, name: string, parents: string[] = ["urn:entity:place"]): QlooTag => ({
  id,
  name,
  type: id.split(":").slice(0, -1).join(":"),
  parents: parents.map((type) => ({ type })),
  popularity: 0.58,
});

const MOCK_TAGS: QlooTag[] = [
  mockTag("urn:tag:genre:place:thrift_store", "Thrift Store"),
  mockTag("urn:tag:category:place:thrift_store", "Thrift Store"),
  mockTag("urn:tag:decor:qloo:thrifted", "Thrifted"),
  mockTag("urn:tag:ambience:qloo:streetwear_culture_influence", "Streetwear Culture Influence"),
  mockTag("urn:tag:decor:qloo:streetwear_store_integration", "Streetwear Store Integration"),
  mockTag("urn:tag:genre:place:vintage_clothing_store", "Vintage Clothing Store"),
  mockTag("urn:tag:specialty_dish:place:jollof", "Jollof"),
  mockTag("urn:tag:specialty_dish:place:jollof_rice", "Jollof Rice"),
  mockTag("urn:tag:genre:place:restaurant:nigerian", "Nigerian Restaurant"),
  mockTag("urn:tag:genre:place:bubble_tea_shop", "Bubble Tea Shop"),
  mockTag("urn:tag:genre:place:cafe", "Cafe"),
  mockTag("urn:tag:genre:place:bakery", "Bakery"),
  mockTag("urn:tag:genre:place:beauty_salon", "Beauty Salon"),
  mockTag("urn:tag:genre:place:nail_salon", "Nail Salon"),
  mockTag("urn:tag:category:place:nail_salon", "Nail Salon"),
  mockTag("urn:tag:genre:place:barber_shop", "Barber Shop"),
  mockTag("urn:tag:genre:place:gym", "Gym"),
  mockTag("urn:tag:genre:place:photography_studio", "Photography Studio"),
  mockTag("urn:tag:genre:place:event_venue", "Event Venue"),
  mockTag("urn:tag:genre:music:afrobeats", "Afrobeats", ["urn:entity:artist", "urn:entity:album"]),
  mockTag("urn:tag:good_for:qloo:afrobeats_nights", "Afrobeats Nights"),
  mockTag("urn:tag:genre:music:amapiano", "Amapiano", ["urn:entity:artist", "urn:entity:album"]),
  mockTag("urn:tag:genre:music:alte", "Alté", ["urn:entity:artist", "urn:entity:album"]),
  mockTag("urn:tag:genre:podcast:business", "Business", ["urn:entity:podcast"]),
];

/**
 * Neighbourhood centres used to name heatmap cells (Qloo returns coordinates only).
 * `bias` is used only by mock mode: how Gen Z / trend-led the area is.
 */
export const CITY_NEIGHBOURHOODS: Record<string, { name: string; lat: number; lon: number; bias: number }[]> = {
  lagos: [
    { name: "Yaba", lat: 6.5095, lon: 3.3711, bias: 0.95 },
    { name: "Lekki Phase 1", lat: 6.4478, lon: 3.4723, bias: 0.9 },
    { name: "Victoria Island", lat: 6.4281, lon: 3.4219, bias: 0.82 },
    { name: "Lagos Island", lat: 6.4541, lon: 3.3947, bias: 0.8 },
    { name: "Ikeja", lat: 6.6018, lon: 3.3515, bias: 0.75 },
    { name: "Surulere", lat: 6.5, lon: 3.35, bias: 0.7 },
    { name: "Ikoyi", lat: 6.4549, lon: 3.4366, bias: 0.6 },
    { name: "Ajah", lat: 6.4698, lon: 3.5852, bias: 0.62 },
    { name: "Gbagada", lat: 6.5527, lon: 3.3895, bias: 0.58 },
    { name: "Maryland", lat: 6.5706, lon: 3.3654, bias: 0.55 },
    { name: "Magodo", lat: 6.615, lon: 3.37, bias: 0.6 },
    { name: "Oshodi", lat: 6.555, lon: 3.348, bias: 0.5 },
    { name: "Ketu", lat: 6.59, lon: 3.383, bias: 0.48 },
    { name: "Apapa", lat: 6.4489, lon: 3.3594, bias: 0.45 },
    { name: "Festac", lat: 6.4669, lon: 3.2836, bias: 0.5 },
    { name: "Ikorodu", lat: 6.6194, lon: 3.5105, bias: 0.4 },
  ],
  abuja: [
    { name: "Wuse 2", lat: 9.0833, lon: 7.4667, bias: 0.92 },
    { name: "Maitama", lat: 9.087, lon: 7.495, bias: 0.85 },
    { name: "Garki", lat: 9.033, lon: 7.489, bias: 0.75 },
    { name: "Asokoro", lat: 9.037, lon: 7.523, bias: 0.7 },
    { name: "Central Business District", lat: 9.058, lon: 7.486, bias: 0.72 },
    { name: "Gwarinpa", lat: 9.11, lon: 7.408, bias: 0.8 },
    { name: "Wuye", lat: 9.056, lon: 7.448, bias: 0.65 },
    { name: "Jabi", lat: 9.073, lon: 7.421, bias: 0.78 },
    { name: "Utako", lat: 9.068, lon: 7.436, bias: 0.7 },
    { name: "Lugbe", lat: 8.985, lon: 7.38, bias: 0.5 },
    { name: "Lokogoma", lat: 8.987, lon: 7.429, bias: 0.55 },
  ],
  ibadan: [
    { name: "Bodija", lat: 7.43, lon: 3.91, bias: 0.88 },
    { name: "University of Ibadan", lat: 7.44, lon: 3.9, bias: 0.82 },
    { name: "Agodi", lat: 7.4, lon: 3.91, bias: 0.72 },
    { name: "Mokola", lat: 7.4, lon: 3.89, bias: 0.7 },
    { name: "Sango", lat: 7.43, lon: 3.88, bias: 0.72 },
    { name: "Jericho", lat: 7.39, lon: 3.87, bias: 0.7 },
    { name: "Dugbe", lat: 7.38, lon: 3.88, bias: 0.72 },
    { name: "Ring Road", lat: 7.35, lon: 3.88, bias: 0.68 },
    { name: "Challenge", lat: 7.35, lon: 3.87, bias: 0.6 },
    { name: "Akobo", lat: 7.46, lon: 3.94, bias: 0.6 },
    { name: "Apata", lat: 7.34, lon: 3.85, bias: 0.55 },
    { name: "Ojoo", lat: 7.48, lon: 3.92, bias: 0.5 },
  ],
  accra: [
    { name: "Osu", lat: 5.556, lon: -0.1823, bias: 0.95 },
    { name: "East Legon", lat: 5.6359, lon: -0.1617, bias: 0.85 },
    { name: "Labone", lat: 5.5686, lon: -0.1723, bias: 0.75 },
    { name: "Cantonments", lat: 5.572, lon: -0.175, bias: 0.78 },
    { name: "Accra Central", lat: 5.5502, lon: -0.2174, bias: 0.7 },
    { name: "Airport Residential", lat: 5.6047, lon: -0.1781, bias: 0.6 },
    { name: "Madina", lat: 5.6681, lon: -0.1659, bias: 0.6 },
    { name: "Spintex", lat: 5.635, lon: -0.105, bias: 0.62 },
    { name: "Achimota", lat: 5.619, lon: -0.227, bias: 0.55 },
    { name: "Adabraka", lat: 5.562, lon: -0.211, bias: 0.6 },
    { name: "Dansoman", lat: 5.536, lon: -0.255, bias: 0.5 },
    { name: "Tema", lat: 5.6698, lon: -0.0166, bias: 0.45 },
  ],
  nairobi: [
    { name: "Westlands", lat: -1.266, lon: 36.803, bias: 0.92 },
    { name: "Kilimani", lat: -1.29, lon: 36.785, bias: 0.9 },
    { name: "Nairobi CBD", lat: -1.2833, lon: 36.8172, bias: 0.75 },
    { name: "Lavington", lat: -1.279, lon: 36.766, bias: 0.75 },
    { name: "Hurlingham", lat: -1.296, lon: 36.79, bias: 0.72 },
    { name: "Parklands", lat: -1.262, lon: 36.816, bias: 0.72 },
    { name: "Karen", lat: -1.319, lon: 36.706, bias: 0.7 },
    { name: "Gigiri", lat: -1.234, lon: 36.813, bias: 0.6 },
    { name: "South B", lat: -1.309, lon: 36.837, bias: 0.6 },
    { name: "South C", lat: -1.319, lon: 36.828, bias: 0.6 },
    { name: "Eastleigh", lat: -1.273, lon: 36.849, bias: 0.55 },
    { name: "Kasarani", lat: -1.22, lon: 36.898, bias: 0.5 },
  ],
  "cape town": [
    { name: "City Bowl", lat: -33.9249, lon: 18.4241, bias: 0.85 },
    { name: "Woodstock", lat: -33.927, lon: 18.445, bias: 0.85 },
    { name: "Sea Point", lat: -33.92, lon: 18.384, bias: 0.8 },
    { name: "Observatory", lat: -33.938, lon: 18.465, bias: 0.8 },
    { name: "Gardens", lat: -33.932, lon: 18.411, bias: 0.78 },
    { name: "Green Point", lat: -33.906, lon: 18.41, bias: 0.72 },
    { name: "Claremont", lat: -33.983, lon: 18.465, bias: 0.72 },
    { name: "Camps Bay", lat: -33.95, lon: 18.378, bias: 0.7 },
    { name: "Newlands", lat: -33.977, lon: 18.452, bias: 0.65 },
    { name: "Mowbray", lat: -33.947, lon: 18.472, bias: 0.6 },
    { name: "Bellville", lat: -33.902, lon: 18.63, bias: 0.5 },
    { name: "Khayelitsha", lat: -34.04, lon: 18.676, bias: 0.45 },
  ],
  london: [
    { name: "Shoreditch", lat: 51.5265, lon: -0.0798, bias: 0.95 },
    { name: "Peckham", lat: 51.4741, lon: -0.0691, bias: 0.9 },
    { name: "Brixton", lat: 51.4613, lon: -0.1156, bias: 0.88 },
    { name: "Camden", lat: 51.539, lon: -0.1426, bias: 0.85 },
    { name: "Dalston", lat: 51.5463, lon: -0.0753, bias: 0.82 },
    { name: "Hackney", lat: 51.545, lon: -0.0553, bias: 0.82 },
    { name: "Soho", lat: 51.5136, lon: -0.1365, bias: 0.8 },
    { name: "Islington", lat: 51.5362, lon: -0.1033, bias: 0.78 },
    { name: "Notting Hill", lat: 51.516, lon: -0.205, bias: 0.72 },
    { name: "Clapham", lat: 51.4627, lon: -0.1382, bias: 0.7 },
    { name: "Greenwich", lat: 51.4826, lon: -0.0077, bias: 0.68 },
    { name: "Stratford", lat: 51.5416, lon: -0.0034, bias: 0.65 },
    { name: "Croydon", lat: 51.3762, lon: -0.0982, bias: 0.55 },
    { name: "Kensington", lat: 51.4991, lon: -0.1938, bias: 0.45 },
  ],
  "new york": [
    { name: "Williamsburg", lat: 40.7081, lon: -73.9571, bias: 0.92 },
    { name: "SoHo", lat: 40.7233, lon: -74.003, bias: 0.9 },
    { name: "Bushwick", lat: 40.6944, lon: -73.9213, bias: 0.85 },
    { name: "Lower East Side", lat: 40.715, lon: -73.9843, bias: 0.85 },
    { name: "East Village", lat: 40.7265, lon: -73.9815, bias: 0.82 },
    { name: "Chelsea", lat: 40.7465, lon: -74.0014, bias: 0.8 },
    { name: "Harlem", lat: 40.8116, lon: -73.9465, bias: 0.8 },
    { name: "Greenpoint", lat: 40.7304, lon: -73.951, bias: 0.78 },
    { name: "DUMBO", lat: 40.7033, lon: -73.9881, bias: 0.78 },
    { name: "Astoria", lat: 40.7644, lon: -73.9235, bias: 0.75 },
    { name: "Upper West Side", lat: 40.787, lon: -73.9754, bias: 0.65 },
    { name: "Flushing", lat: 40.7675, lon: -73.8331, bias: 0.6 },
  ],
  toronto: [
    { name: "Queen West", lat: 43.6468, lon: -79.4119, bias: 0.9 },
    { name: "Kensington Market", lat: 43.6545, lon: -79.4005, bias: 0.9 },
    { name: "Liberty Village", lat: 43.6378, lon: -79.42, bias: 0.82 },
    { name: "The Annex", lat: 43.667, lon: -79.407, bias: 0.8 },
    { name: "Distillery District", lat: 43.6503, lon: -79.3596, bias: 0.78 },
    { name: "Downtown Core", lat: 43.649, lon: -79.3817, bias: 0.75 },
    { name: "Leslieville", lat: 43.664, lon: -79.334, bias: 0.75 },
    { name: "Yorkville", lat: 43.671, lon: -79.393, bias: 0.72 },
    { name: "Greektown", lat: 43.6775, lon: -79.349, bias: 0.7 },
    { name: "North York", lat: 43.7615, lon: -79.4111, bias: 0.6 },
    { name: "Scarborough", lat: 43.7731, lon: -79.2578, bias: 0.5 },
    { name: "Etobicoke", lat: 43.6205, lon: -79.5132, bias: 0.5 },
  ],
};

/**
 * How each city is sent to Qloo's filter.location.query. Most resolve fine by plain
 * name; a few are ambiguous (plain "New York" → the state; plain "Ibadan" → the wrong
 * locality), so they get a qualified query here.
 */
const CITY_QLOO_QUERY: Record<string, string> = {
  ibadan: "Ibadan, Nigeria",
  "new york": "New York City",
};

/** The location string to send to Qloo for a given display city name. */
export function cityQuery(city: string): string {
  return CITY_QLOO_QUERY[city.toLowerCase().trim()] ?? city;
}

export interface NeighbourhoodDemand {
  name: string;
  lat: number;
  lon: number;
  /** Mean affinity of the heatmap cells assigned to this neighbourhood (0–1). */
  affinity: number;
  /** Highest single-cell affinity in the neighbourhood (0–1). */
  peakAffinity: number;
  cells: number;
}

const kmBetween = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

/**
 * Group heatmap cells into named neighbourhoods: each cell goes to the nearest
 * neighbourhood centre within `maxKm`; cells further away are dropped.
 * Returns neighbourhoods sorted by affinity, highest first.
 */
export function labelNeighbourhoods(
  cells: QlooHeatmapCell[],
  city: string,
  maxKm = 3,
): NeighbourhoodDemand[] {
  const hoods = CITY_NEIGHBOURHOODS[city.toLowerCase().split(",")[0].trim()];
  if (!hoods) return [];
  const groups = new Map<string, number[]>();
  for (const cell of cells) {
    let best: { name: string; km: number } | undefined;
    for (const h of hoods) {
      const km = kmBetween(cell.location.latitude, cell.location.longitude, h.lat, h.lon);
      if (km <= maxKm && (!best || km < best.km)) best = { name: h.name, km };
    }
    if (best) groups.set(best.name, [...(groups.get(best.name) ?? []), cell.query.affinity]);
  }
  return hoods
    .filter((h) => groups.has(h.name))
    .map((h) => {
      const values = groups.get(h.name)!;
      return {
        name: h.name,
        lat: h.lat,
        lon: h.lon,
        affinity: round(values.reduce((s, v) => s + v, 0) / values.length),
        peakAffinity: round(Math.max(...values)),
        cells: values.length,
      };
    })
    .sort((a, b) => b.affinity - a.affinity);
}

/** Shape a mock seed like /search (`types`) or /v2/insights (`type` + `subtype`) results. */
function toEntity(seed: MockSeed, shape: "search" | "insights" = "search"): QlooEntity {
  const kind = seed.type.split(":").pop();
  return {
    entity_id: fakeId(seed.name),
    name: seed.name,
    ...(shape === "search" ? { types: [seed.type] } : { type: "urn:entity", subtype: seed.type }),
    popularity: seed.popularity,
    disambiguation: seed.name,
    properties: { short_description: seed.description },
    tags: seed.keywords.slice(0, 3).map((k) => ({
      tag_id: `urn:tag:keyword:${kind}:${slug(k)}`,
      name: k,
      type: `urn:tag:keyword:${kind}`,
      value: `urn:tag:keyword:${kind}:${slug(k)}`,
    })),
  };
}

/** Score how well a seed matches some free text (0–1). */
/** Insights matching: 0 hits → 0, 1 hit → 0.5, 2+ hits → 1 (signals are short tag lists). */
function signalMatch(seed: MockSeed, text: string): number {
  const words = new Set(text.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2));
  const hay = `${seed.description} ${seed.keywords.join(" ")}`.toLowerCase();
  return Math.min(1, [...words].filter((w) => hay.includes(w)).length / 2);
}

function textMatch(seed: MockSeed, text: string): number {
  const words = text.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 2);
  if (!words.length) return 0;
  const hay = `${seed.name} ${seed.description} ${seed.keywords.join(" ")}`.toLowerCase();
  return words.filter((w) => hay.includes(w)).length / words.length;
}

function mockSearch(params: Record<string, string>): QlooSearchResponse {
  const query = params.query ?? "";
  const types = params.types?.split(",") ?? [];
  const take = Number(params.take ?? 5);
  const results = MOCK_ENTITIES.filter((e) => !types.length || types.includes(e.type))
    .map((e) => ({ e, score: e.name.toLowerCase() === query.toLowerCase() ? 2 : textMatch(e, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.popularity - a.e.popularity)
    .slice(0, take)
    .map((x) => toEntity(x.e));
  return { results };
}

function mockTags(params: Record<string, string>): QlooTagsResponse {
  const query = (params["filter.query"] ?? "").toLowerCase();
  const take = Number(params.take ?? 5);
  const words = query.split(/\s+/).filter(Boolean);
  const tags = MOCK_TAGS.filter((t) =>
    words.some((w) => t.name.toLowerCase().includes(w) || t.id.includes(slug(w))),
  ).slice(0, take);
  return { success: true, results: { tags } };
}

/** Gen Z audiences make trend-led results score a bit higher, as live Qloo would. */
function audienceBoost(params: Record<string, string>): number {
  const age = params["signal.demographics.age"] ?? "";
  const audiences = params["signal.demographics.audiences"] ?? "";
  if (/24_and_younger|25_to_29|35_and_younger/.test(age) || /gen_?z/i.test(audiences)) return 0.12;
  return 0;
}

function mockInsights(params: Record<string, string>): QlooInsightsResponse {
  const type = params["filter.type"];
  const seedText = Object.values(params).join("|");
  const rand = seeded(seedText);
  // Entity IDs are opaque UUIDs, so mock matching uses only tag names and the city.
  const signalText = [params["signal.interests.tags"], params["filter.tags"], params["filter.location.query"]]
    .filter(Boolean)
    .join(" ")
    .replace(/urn:tag:[a-z_]+:([a-z_]+:)*/g, " ")
    .replace(/_/g, " ");
  const boost = audienceBoost(params);
  const take = Number(params.take ?? 10);

  if (type === "urn:heatmap") {
    // Live Qloo returns hundreds of unnamed grid cells; mock a small grid around each neighbourhood.
    // Match the query ("new york city", "ibadan, nigeria", …) to a known city key.
    const raw = (params["filter.location.query"] ?? "lagos").toLowerCase();
    const cityKey = Object.keys(CITY_NEIGHBOURHOODS).find((k) => raw.includes(k)) ?? "lagos";
    const hoods = CITY_NEIGHBOURHOODS[cityKey];
    const heatmap: QlooHeatmapCell[] = hoods
      .flatMap((h) =>
        Array.from({ length: 9 }, (_, i) => {
          const affinity = Math.min(1, h.bias * (0.6 + rand() * 0.35) + boost);
          const latitude = round(h.lat + (Math.floor(i / 3) - 1) * 0.012, 6);
          const longitude = round(h.lon + ((i % 3) - 1) * 0.012, 6);
          return {
            location: { latitude, longitude, geohash: `s${Math.round(latitude * 1e3)}${Math.round(longitude * 1e3)}` },
            query: { affinity: round(affinity), affinity_rank: 0, popularity: round(0.2 + rand() * 0.8) },
          };
        }),
      )
      .sort((a, b) => b.query.affinity - a.query.affinity);
    heatmap.forEach((c, i) => (c.query.affinity_rank = round(1 - i / heatmap.length)));
    return { success: true, results: { heatmap }, duration: Math.round(80 + rand() * 120) };
  }

  if (type === "urn:demographics") {
    // Not used heavily by HustlePulse; return an empty, well-formed payload.
    return { success: true, results: { entities: [] } };
  }

  const city = params["filter.location.query"]?.toLowerCase().split(",")[0].trim();
  const pool = MOCK_ENTITIES.filter(
    (e) => e.type === type && (type !== "urn:entity:place" || !city || e.keywords.includes(city)),
  );
  const entities = pool
    .map((e) => {
      const match = signalText ? signalMatch(e, signalText) : 0;
      const affinity = Math.min(0.99, 0.35 + match * 0.45 + boost + rand() * 0.15);
      return {
        ...toEntity(e, "insights"),
        query: {
          affinity: round(affinity),
          distance: 0,
          measurements: { audience_growth: 0 },
        },
      };
    })
    .sort((a, b) => b.query.affinity - a.query.affinity)
    .slice(0, take);
  return { success: true, results: { entities }, duration: Math.round(80 + rand() * 120) };
}
