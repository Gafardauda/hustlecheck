import { agentAvailable, runAgent } from "@/lib/agent";
import { Run } from "@/lib/pipeline";
import { buildPreviewReport } from "@/lib/preview-report";
import { BUDGETS, CITIES, type CheckEvent, type City, type HustleInput } from "@/lib/report";
import { saveReport } from "@/lib/store";

// The agent makes several Gemini and Qloo calls; allow up to a minute.
export const maxDuration = 60;

/** A short, safe reason for the fallback note (never includes keys or raw provider messages). */
function agentFailureReason(err: unknown): string {
  const e = err as { statusCode?: number; lastError?: { statusCode?: number }; message?: string };
  const status = e.statusCode ?? e.lastError?.statusCode;
  const msg = e.message?.toLowerCase() ?? "";
  if (status === 429 || msg.includes("quota") || msg.includes("rate limit")) return "Gemini rate limit or quota reached";
  if (status === 400 && msg.includes("api key")) return "Gemini API key not valid";
  if (status === 401 || status === 403) return "Gemini API key rejected";
  if (status === 404) return "Gemini model not found";
  if (msg.includes("no qloo taste tags")) return "no matching Qloo tags";
  return status ? `Gemini error ${status}` : "unexpected error";
}

/**
 * POST /api/check streams newline-delimited JSON events (see CheckEvent):
 * each finished step and Qloo call as it happens, then the full report.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<HustleInput> | null;
  const idea = body?.idea?.trim() ?? "";
  if (idea.length < 3 || idea.length > 300) {
    return Response.json({ error: "Describe your hustle in 3–300 characters." }, { status: 400 });
  }
  if (!CITIES.includes(body?.city as City)) {
    return Response.json({ error: `City must be one of: ${CITIES.join(", ")}.` }, { status: 400 });
  }
  const budget = BUDGETS.includes(body?.budget as (typeof BUDGETS)[number]) ? body?.budget : undefined;
  const input: HustleInput = { idea, city: body!.city as City, budget };

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      // The visitor may leave mid-check; after that, stop sending instead of throwing.
      const send = (event: CheckEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        let report;
        if (agentAvailable()) {
          try {
            report = await runAgent(new Run(input, {}, send));
          } catch (err) {
            console.error("Agent failed; falling back to keyword matching", err);
            const run = new Run(input, {}, send);
            run.notes.push(`The AI agent was unavailable (${agentFailureReason(err)}), so keywords were matched automatically.`);
            report = await buildPreviewReport(run);
          }
        } else {
          report = await buildPreviewReport(new Run(input, {}, send));
        }
        // Save it so the share link can show this exact report later (skipped if storage is off).
        const id = await saveReport(report);
        send({ type: "report", report: id ? { ...report, id } : report });
      } catch (err) {
        console.error("Hustle check failed", err);
        send({ type: "error", message: "The hustle check failed. Please try again in a minute." });
      } finally {
        if (!closed) controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
