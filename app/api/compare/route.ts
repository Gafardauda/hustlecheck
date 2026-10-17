import { compareCities } from "@/lib/compare";
import { AUDIENCES, type AudienceKey } from "@/lib/report";

export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { idea?: string; audience?: string } | null;
  const idea = body?.idea?.trim() ?? "";
  if (idea.length < 3 || idea.length > 300) {
    return Response.json({ error: "Describe your hustle in 3–300 characters." }, { status: 400 });
  }
  const audienceKey = AUDIENCES.some((a) => a.key === body?.audience) ? (body!.audience as AudienceKey) : "genz";

  try {
    const result = await compareCities(idea, audienceKey);
    return Response.json(result);
  } catch (err) {
    console.error("Compare failed", err);
    return Response.json({ error: "The comparison failed. Please try again in a minute." }, { status: 500 });
  }
}
