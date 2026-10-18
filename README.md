# HustlePulse

**Check the pulse of your side hustle before you launch.**

HustlePulse is an AI agent that uses [Qloo](https://qloo.com)'s taste graph to check whether a side hustle has real local demand — *before* you spend a naira on it. Describe your idea and your city, and the agent tells you **where** your customers cluster, **who** to partner with, and hands you a data-backed launch plan. Every idea gets a **PulseScore (0–100)** built from audience fit, location demand and partner strength.

🔗 **Live demo:** https://hustlepulse.vercel.app
📺 **Demo video:** _(coming soon)_

Built solo for the **Qloo Agentic Hackathon** by Gafar Dauda (data analyst, Nigeria).

---

## Why it's better *because of* Qloo

An LLM alone will happily invent a trendy-sounding neighbourhood, a plausible-but-wrong local artist, and a launch plan with zero evidence. HustlePulse grounds every recommendation in Qloo's taste graph, so the places are real, the partners actually match the audience, and the plan cites numbers.

To prove it, we ran the same ideas through HustlePulse (Qloo + AI) and through the **same Gemini model with no Qloo**, then used Qloo itself as an independent referee to score both. Across 10 ideas in 9 cities:

| What we measured | HustlePulse (Qloo + AI) | AI only |
| --- | --- | --- |
| Names **real** local places | **100%** | 70% |
| Picks **on-target** local artists | **48%** | 23% |
| **Consistent** across repeat runs | **37%** | 29% |
| **Cites evidence** (real numbers) | **100%** | 3% |

<sub>Full method and the harness are described in [the benchmark section](#the-benchmark) below. Numbers are regenerated into `lib/benchmark.json` and shown live on the app's "Why trust this?" screen.</sub>

---

## What it does

1. **Pitch your hustle** — idea, city (9 to choose from), target audience, optional budget.
2. **Watch the agent work** — a live trace of every Qloo call as it runs.
3. **Get a demand scorecard** — PulseScore, sub-score bars, a neighbourhood heatmap, comparable brands your customers already love, and ranked partner picks.
4. **Read a launch plan** — where to launch, who to collab with, naming ideas, a first-month checklist. Every report gets a shareable link and a social card.
5. **See why to trust it** — the Qloo-vs-AI-only benchmark and a full log of every Qloo call made for your check.

### Extra tools

- **🎯 Audience picker** — target Gen Z (18–29), Under 25, Millennials, or All adults. Each maps to real Qloo age brackets, and the results genuinely change with your pick.
- **🧬 Customer Taste DNA** — Qloo's cross-domain read on your audience: the films, shows, games and books they're into, so your branding speaks their language.
- **🏙️ Best-city comparison** — not sure where to launch? Drop one idea and rank demand across all 9 cities at once.
- **🔗 Shareable results** — every finished report saves to a short link with a branded social card.

**Cities:** Lagos · Abuja · Ibadan · Accra · Nairobi · Cape Town · London · New York · Toronto

---

## How the agent works

HustlePulse is a **tool-calling agent** built on the Vercel AI SDK with Google Gemini. The model is given two tools and must use Qloo to answer — it can't just free-associate:

1. **`research_idea`** — the model extracts keywords, comparable brands and local artists from the free-text idea. These resolve to Qloo entity IDs via `/search` and `/v2/tags`.
2. **`analyze_market`** — measures audience affinity, pulls a city **heatmap** (`filter.type=urn:heatmap`) and labels the hot cells with real neighbourhood names, finds partner artists/places/brands with Qloo as the anchor, and reads the cross-domain **Taste DNA**.
3. The agent then computes the **PulseScore** from a transparent, fixed formula (see below) and writes the launch plan with **structured output**, grounded in the evidence it just gathered.

If the agent fails or the LLM is rate-limited, a **keyword-matching fallback** (`lib/preview-report.ts`) still produces a real Qloo-backed report, and the report says why it fell back — the app never shows made-up data as if it were live.

### The PulseScore

```
PulseScore = 40% × audience fit  +  35% × location demand  +  25% × partner strength
```

Shown in the UI as *"who wants it" (40%)*, *"where they are" (35%)* and *"who you can collab with" (25%)* — all three bars cite the Qloo numbers they came from.

### Qloo endpoints used

| Endpoint | Used for |
| --- | --- |
| `GET /search` | Resolve idea keywords, brands, artists and places to Qloo entity IDs |
| `GET /v2/tags` | Find valid tag IDs (cuisines, styles, genres) |
| `GET /v2/insights` | Audience affinity, partner picks, Taste DNA (per `filter.type`) |
| `GET /v2/insights` (`filter.type=urn:heatmap`) | Neighbourhood demand map over a city |

All Qloo access lives in a single module, [`lib/qloo.ts`](lib/qloo.ts) — typed responses, an in-memory cache, concurrency limiting and retry on rate limits.

---

## Tech stack

- **Next.js** (App Router, Turbopack) + **TypeScript** + **Tailwind CSS**
- **Vercel AI SDK** (`ai`) with **Google Gemini** (`@ai-sdk/google`) — tool-calling agent + structured output
- **Qloo** Insights API (taste graph + heatmaps)
- **Recharts** — neighbourhood scatter map and benchmark chart
- **Upstash Redis** (optional) — persists reports behind shareable `/r/<id>` links
- Deployed on **Vercel**

---

## Run it locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Gafardauda/hustlepulse.git
cd hustlepulse
npm install
cp .env.local.example .env.local   # then fill in your keys (see below)
npm run dev
```

Open http://localhost:3000.

**No keys? No problem.** Set `USE_MOCK_QLOO=true` (or leave the Qloo key blank) and the app runs end-to-end on built-in sample data, so you can explore every screen without any API keys.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `QLOO_API_KEY` | for live data | Qloo hackathon API key |
| `QLOO_BASE_URL` | | Defaults to `https://hackathon.api.qloo.com` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | for the agent | Gemini API key ([Google AI Studio](https://aistudio.google.com/)) |
| `GEMINI_MODEL` | | Defaults to `gemini-3.5-flash-lite` |
| `USE_MOCK_QLOO` | | `true` to use built-in sample data instead of calling Qloo |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | for share links | Upstash Redis; without them, reports still work but aren't persisted to a share link |

> **Note:** Qloo response data and API keys are never committed to this repo. Keys live in `.env.local` (git-ignored); only aggregate benchmark percentages are checked in.

---

## The benchmark

The harness runs each sample idea through HustlePulse and through the same Gemini model with **no** Qloo access, producing the same kinds of picks (neighbourhoods, brands, artists, venues) so both can be scored fairly. Qloo is then used as an **independent referee**:

- **Real places** — does Qloo actually know this venue in (or near) the city? (`/search`)
- **On-target artists** — is this artist in Qloo's top set for the city's target audience? (`/v2/insights`)
- **Consistency** — overlap of picks across two runs of the same idea.
- **Cites evidence** — does the neighbourhood reasoning contain real numbers?

Only aggregate percentages are stored, in [`lib/benchmark.json`](lib/benchmark.json), and surfaced on the app's "Why trust this?" screen. (The harness scripts themselves are kept out of the repo since they hit the live APIs.)

---

## License

[MIT](LICENSE)
