# HustlePulse — project brief

Entry for the **Qloo Agentic Hackathon** on Devpost (deadline **Oct 30, 2026, 11:45 pm EDT**). Solo builder: Gafar Dauda (data analyst, Nigeria).

## Tagline
"Check the pulse of your side hustle before you launch."

## One-liner
An AI agent that uses Qloo's taste graph to check if a Gen Z side hustle has real local demand: where the customers are, who to partner with, and a data-backed launch plan.

## Hackathon rules that shape the build
- Must integrate the **Qloo API** and be agentic (agent framework or tool-calling agent).
- Core test: the app must be clearly better **because of Qloo**, not just the LLM. Show this.
- Required: publicly hosted demo, public repo with **MIT license** (visible in repo About), run instructions in README, text description.
- Judging (equal weight): technical implementation (use of Qloo), design (complete product), potential impact, quality/originality of idea.
- Do NOT commit Qloo response data or API keys to the public repo. Server-side caching is fine.

## Stack
- Next.js (App Router) + TypeScript + Tailwind CSS
- Vercel AI SDK (`ai`) with Gemini (`@ai-sdk/google`) for the agent, using tool calls
- Recharts for charts; deploy on Vercel
- Keys in `.env.local` (git-ignored): `QLOO_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`
- `USE_MOCK_QLOO=true` until the Qloo key arrives

## Qloo API facts (hackathon)
- Base URL: `https://hackathon.api.qloo.com` (production/staging URLs return 401 with hackathon keys)
- Auth header: `X-Api-Key: <key>` (not Bearer, not query param)
- `GET /v2/insights` — main endpoint. Params in query string. `filter.type` required:
  `urn:entity:artist | book | brand | destination | movie | person | place | podcast | tv_show | video_game`
- `GET /search` — resolve names (brands, artists, places) to Qloo entity IDs
- `GET /v2/tags` — find valid tag IDs (cuisines, styles, genres) by keyword
- Signals/filters (check Entity Type Parameter Guide per filter.type): `signal.interests.entities`, `signal.interests.tags`, `signal.demographics.audiences`, `signal.location`, `filter.tags`, `filter.location`; heatmaps via `filter.type=urn:heatmap`
- Invalid params are silently ignored → empty results. Do not use legacy `/recommendations` or `/recs`.
- Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide

## Agent flow
1. User input: hustle idea (free text), city, optional budget.
2. LLM extracts keywords → `/v2/tags` + `/search` to get tag IDs and comparable brand/place entity IDs.
3. `/v2/insights` with Gen Z audiences (18–24, 25–29) to measure audience affinity.
4. Heatmap insights over the city → neighbourhoods where the taste over-indexes.
5. Insights for artists, podcasts, places, brands → partner/collab picks with affinity scores.
6. Compute **PulseScore (0–100)** = weighted audience fit + location demand + partner strength (transparent formula, shown in UI).
7. LLM writes the launch plan, citing the Qloo evidence.

## Screens
1. Pitch your hustle (input)
2. Agent at work (live step trace of Qloo calls)
3. Demand scorecard: PulseScore, sub-score bars, neighbourhood heatmap, comparable brands, partner picks
4. Launch plan (where, who to collab with, naming ideas, first-month checklist; shareable)
5. "Why trust this": Qloo vs LLM-only benchmark chart + list of every Qloo call

## Visual style
Dark violet background (#0E0B1F), electric lime accent (#C6FF3D), violet (#7C3AED); bold, Gen Z, data-forward.

## Build order
1. Scaffold + repo + MIT license + deploy to Vercel
2. Qloo client module with mock mode (`lib/qloo.ts`), typed responses
3. UI screens with mock data
4. Agent with tool calls
5. Swap to live Qloo when key arrives; test Lagos coverage (fallbacks: London, Accra)
6. Benchmark on 20 sample ideas; polish; README; Devpost write-up
