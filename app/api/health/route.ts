import { createHash } from "node:crypto";

/**
 * Temporary config check: describes each key without revealing it, so the value
 * Vercel sees can be compared with the local one. Remove once the deploy is verified.
 */
function describe(value: string | undefined) {
  if (!value) return { set: false };
  return {
    set: true,
    length: value.length,
    startsWithAIza: value.startsWith("AIza"),
    hasWhitespace: /\s/.test(value),
    hasQuotes: /["']/.test(value),
    fingerprint: createHash("sha256").update(value).digest("hex").slice(0, 8),
  };
}

export function GET() {
  return Response.json({
    gemini: describe(process.env.GOOGLE_GENERATIVE_AI_API_KEY),
    qloo: describe(process.env.QLOO_API_KEY),
    useMockQloo: process.env.USE_MOCK_QLOO ?? null,
    geminiModel: process.env.GEMINI_MODEL ?? "(default)",
  });
}
