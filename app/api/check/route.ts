import { buildPreviewReport } from "@/lib/preview-report";
import { BUDGETS, CITIES, type City, type HustleInput } from "@/lib/report";

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

  try {
    const report = await buildPreviewReport({ idea, city: body!.city as City, budget });
    return Response.json(report);
  } catch (err) {
    console.error("Hustle check failed", err);
    return Response.json({ error: "The hustle check failed. Please try again." }, { status: 500 });
  }
}
