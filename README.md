# HustlePulse

**Check the pulse of your side hustle before you launch.**

HustlePulse is an AI agent that uses [Qloo](https://qloo.com)'s taste graph to check whether a Gen Z side hustle has real local demand: where the customers are, who to partner with, and a data-backed launch plan. Every idea gets a **PulseScore (0–100)** built from audience fit, location demand and partner strength.

Built for the Qloo Agentic Hackathon.

## How it works

1. You describe your hustle idea, your city and (optionally) your budget.
2. The agent resolves your idea into Qloo tags and comparable brands and places (`/v2/tags`, `/search`).
3. It measures Gen Z audience affinity and maps which neighbourhoods over-index for that taste (`/v2/insights`, heatmaps).
4. It finds artists, podcasts, places and brands to partner with, ranked by affinity.
5. It computes your PulseScore and writes a launch plan that cites the Qloo evidence.

## Tech stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Vercel AI SDK with Google Gemini (tool-calling agent)
- Qloo Insights API
- Recharts

## Run it locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/Gafardauda/hustlepulse.git
cd hustlepulse
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `QLOO_API_KEY` | Qloo hackathon API key |
| `QLOO_BASE_URL` | Defaults to `https://hackathon.api.qloo.com` |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key for the agent |
| `USE_MOCK_QLOO` | `true` to use built-in sample data instead of calling Qloo |

With `USE_MOCK_QLOO=true` (or no Qloo key), the app runs entirely on sample data, so you can try it without a Qloo key.

## License

[MIT](LICENSE)
