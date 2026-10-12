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
// Types (shaped after Qloo's documented responses; extra fields are allowed)
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

export interface QlooTag {
  id: string; // e.g. "urn:tag:genre:place:streetwear"
  name: string;
  type: string; // e.g. "urn:tag:genre:place"
  value?: string;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  types: QlooEntityType[];
  subtype?: string;
  popularity: number; // 0–1 percentile
  properties?: {
    short_description?: string;
    address?: string;
    image?: { url: string };
    [key: string]: unknown;
  };
  location?: { lat: number; lon: number };
  tags?: QlooTag[];
  /** Present on /v2/insights results: how strongly the entity matches the signals. */
  query?: {
    affinity: number; // 0–1
    measurements?: { audience_growth?: number };
  };
}

export interface QlooHeatmapCell {
  location: { latitude: number; longitude: number; geohash: string };
  query: {
    affinity: number; // 0–1, how much this area over-indexes for the taste
    affinity_rank: number; // 0–1 percentile within the city
    popularity: number; // 0–1
  };
  /** Not part of Qloo's response; added by mock mode so the UI can label cells. */
  neighbourhood?: string;
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

/** GET /search — resolve a name like "Nike" or "Burna Boy" to Qloo entities. */
export function searchEntities(
  query: string,
  opts: { types?: QlooEntityType[]; take?: number } = {},
): Promise<QlooResult<QlooSearchResponse>> {
  const params: QlooParams = { query, types: opts.types, take: opts.take ?? 5 };
  return request("/search", params, (p) => mockSearch(p), (d) => d.results.length);
}

/** GET /v2/tags — find tag IDs by keyword, e.g. "thrift" or "jollof". */
export function findTags(
  query: string,
  opts: { take?: number } = {},
): Promise<QlooResult<QlooTagsResponse>> {
  const params: QlooParams = { "filter.query": query, take: opts.take ?? 5 };
  return request("/v2/tags", params, (p) => mockTags(p), (d) => d.results.tags.length);
}

/**
 * GET /v2/insights — the main endpoint. `filter.type` is required.
 * Pass Qloo's dotted param names directly, for example:
 *   { "filter.type": "urn:heatmap", "filter.location.query": "Lagos",
 *     "signal.interests.tags": ["urn:tag:genre:place:streetwear"] }
 */
export function getInsights(params: QlooParams): Promise<QlooResult<QlooInsightsResponse>> {
  if (!params["filter.type"]) throw new Error("getInsights: 'filter.type' is required");
  return request(
    "/v2/insights",
    params,
    (p) => mockInsights(p),
    (d) => (d.results.entities?.length ?? 0) + (d.results.heatmap?.length ?? 0),
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

async function request<T>(
  endpoint: QlooCallRecord["endpoint"],
  rawParams: QlooParams,
  mock: (params: Record<string, string>) => T,
  count: (data: T) => number,
): Promise<QlooResult<T>> {
  const params = toQueryParams(rawParams);
  const useMock = isMockMode();
  const started = Date.now();
  const call: QlooCallRecord = { endpoint, params, mock: useMock, ms: 0, resultCount: 0, ok: true };

  const cacheKey = `${useMock}:${endpoint}?${new URLSearchParams(params).toString()}`;
  if (cache.has(cacheKey)) {
    const data = cache.get(cacheKey) as T;
    return { data, call: { ...call, resultCount: count(data) } };
  }

  try {
    let data: T;
    if (useMock) {
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // feel like a network call
      data = mock(params);
    } else {
      const base = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com";
      const res = await fetch(`${base}${endpoint}?${new URLSearchParams(params)}`, {
        headers: { "X-Api-Key": process.env.QLOO_API_KEY!, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Qloo ${endpoint} returned ${res.status}: ${await res.text()}`);
      data = (await res.json()) as T;
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

const MOCK_TAGS: QlooTag[] = [
  { id: "urn:tag:genre:place:streetwear", name: "Streetwear", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:thrift_store", name: "Thrift Store", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:vintage_clothing", name: "Vintage Clothing", type: "urn:tag:genre:place" },
  { id: "urn:tag:style:brand:sustainable_fashion", name: "Sustainable Fashion", type: "urn:tag:style:brand" },
  { id: "urn:tag:genre:place:restaurant:nigerian", name: "Nigerian", type: "urn:tag:genre:place:restaurant" },
  { id: "urn:tag:genre:place:restaurant:west_african", name: "West African", type: "urn:tag:genre:place:restaurant" },
  { id: "urn:tag:genre:place:bubble_tea", name: "Bubble Tea", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:cafe", name: "Cafe", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:bakery", name: "Bakery", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:beauty_salon", name: "Beauty Salon", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:nail_salon", name: "Nail Salon", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:barber_shop", name: "Barber Shop", type: "urn:tag:genre:place" },
  { id: "urn:tag:style:brand:skincare", name: "Skincare", type: "urn:tag:style:brand" },
  { id: "urn:tag:genre:place:gym", name: "Gym", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:music:afrobeats", name: "Afrobeats", type: "urn:tag:genre:music" },
  { id: "urn:tag:genre:music:amapiano", name: "Amapiano", type: "urn:tag:genre:music" },
  { id: "urn:tag:genre:music:alte", name: "Alté", type: "urn:tag:genre:music" },
  { id: "urn:tag:genre:place:photography_studio", name: "Photography Studio", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:video_game_store", name: "Video Game Store", type: "urn:tag:genre:place" },
  { id: "urn:tag:genre:place:event_venue", name: "Event Venue", type: "urn:tag:genre:place" },
  { id: "urn:tag:keyword:brand:content_creation", name: "Content Creation", type: "urn:tag:keyword:brand" },
  { id: "urn:tag:genre:podcast:business", name: "Business", type: "urn:tag:genre:podcast" },
];

/** City neighbourhood centroids for mock heatmaps. `bias` = how Gen Z / trend-led the area is. */
const MOCK_CITIES: Record<string, { name: string; lat: number; lon: number; bias: number }[]> = {
  lagos: [
    { name: "Yaba", lat: 6.5095, lon: 3.3711, bias: 0.95 },
    { name: "Lekki Phase 1", lat: 6.4478, lon: 3.4723, bias: 0.9 },
    { name: "Victoria Island", lat: 6.4281, lon: 3.4219, bias: 0.82 },
    { name: "Ikeja GRA", lat: 6.5833, lon: 3.35, bias: 0.75 },
    { name: "Surulere", lat: 6.5, lon: 3.35, bias: 0.7 },
    { name: "Ikoyi", lat: 6.4549, lon: 3.4366, bias: 0.6 },
    { name: "Ajah", lat: 6.4698, lon: 3.5852, bias: 0.62 },
    { name: "Gbagada", lat: 6.5527, lon: 3.3895, bias: 0.58 },
    { name: "Festac", lat: 6.4669, lon: 3.2836, bias: 0.5 },
    { name: "Ikorodu", lat: 6.6194, lon: 3.5105, bias: 0.4 },
  ],
  london: [
    { name: "Shoreditch", lat: 51.5265, lon: -0.0798, bias: 0.95 },
    { name: "Peckham", lat: 51.4741, lon: -0.0691, bias: 0.9 },
    { name: "Brixton", lat: 51.4613, lon: -0.1156, bias: 0.88 },
    { name: "Camden", lat: 51.539, lon: -0.1426, bias: 0.85 },
    { name: "Dalston", lat: 51.5463, lon: -0.0753, bias: 0.82 },
    { name: "Stratford", lat: 51.5416, lon: -0.0034, bias: 0.65 },
    { name: "Croydon", lat: 51.3762, lon: -0.0982, bias: 0.55 },
    { name: "Kensington", lat: 51.4991, lon: -0.1938, bias: 0.45 },
  ],
  accra: [
    { name: "Osu", lat: 5.556, lon: -0.1823, bias: 0.95 },
    { name: "East Legon", lat: 5.6359, lon: -0.1617, bias: 0.85 },
    { name: "Labone", lat: 5.5686, lon: -0.1723, bias: 0.75 },
    { name: "Madina", lat: 5.6681, lon: -0.1659, bias: 0.6 },
    { name: "Airport Residential", lat: 5.6047, lon: -0.1781, bias: 0.6 },
    { name: "Tema", lat: 5.6698, lon: -0.0166, bias: 0.45 },
  ],
};

function toEntity(seed: MockSeed, extraTags: QlooTag[] = []): QlooEntity {
  return {
    entity_id: fakeId(seed.name),
    name: seed.name,
    types: [seed.type],
    subtype: seed.type === "urn:entity:place" ? "urn:entity:place" : undefined,
    popularity: seed.popularity,
    properties: { short_description: seed.description },
    tags: [
      ...seed.keywords.slice(0, 3).map((k) => ({
        id: `urn:tag:keyword:${seed.type.split(":").pop()}:${slug(k)}`,
        name: k,
        type: `urn:tag:keyword:${seed.type.split(":").pop()}`,
      })),
      ...extraTags,
    ],
  };
}

/** Score how well a seed matches some free text (0–1). */
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
  const signalText = [
    params["signal.interests.tags"],
    params["signal.interests.entities"],
    params["filter.tags"],
    params["filter.location.query"],
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/urn:tag:[a-z_]+:([a-z_]+:)*/g, " ")
    .replace(/_/g, " ");
  const boost = audienceBoost(params);
  const take = Number(params.take ?? 10);

  if (type === "urn:heatmap") {
    const cityKey = (params["filter.location.query"] ?? "lagos").toLowerCase().split(",")[0].trim();
    const hoods = MOCK_CITIES[cityKey] ?? MOCK_CITIES.lagos;
    const heatmap: QlooHeatmapCell[] = hoods
      .map((h) => {
        const affinity = Math.min(0.99, h.bias * (0.7 + rand() * 0.25) + boost);
        return {
          neighbourhood: h.name,
          location: {
            latitude: round(h.lat + (rand() - 0.5) * 0.01, 4),
            longitude: round(h.lon + (rand() - 0.5) * 0.01, 4),
            geohash: `s${slug(h.name).slice(0, 5)}`,
          },
          query: { affinity: round(affinity), affinity_rank: 0, popularity: round(0.3 + rand() * 0.6) },
        };
      })
      .sort((a, b) => b.query.affinity - a.query.affinity);
    heatmap.forEach((c, i) => (c.query.affinity_rank = round(1 - i / heatmap.length)));
    return { success: true, results: { heatmap }, duration: Math.round(80 + rand() * 120) };
  }

  if (type === "urn:demographics") {
    // Not used heavily by HustlePulse; return an empty, well-formed payload.
    return { success: true, results: { entities: [] } };
  }

  const pool = MOCK_ENTITIES.filter((e) => e.type === type);
  const entities = pool
    .map((e) => {
      const match = signalText ? textMatch(e, signalText) : 0;
      const affinity = Math.min(0.99, 0.35 + match * 0.45 + boost + rand() * 0.15);
      return {
        ...toEntity(e),
        query: {
          affinity: round(affinity),
          measurements: { audience_growth: round((rand() - 0.3) * 0.4) },
        },
      };
    })
    .sort((a, b) => b.query.affinity - a.query.affinity)
    .slice(0, take);
  return { success: true, results: { entities }, duration: Math.round(80 + rand() * 120) };
}
