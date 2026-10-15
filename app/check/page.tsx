import Link from "next/link";
import { Suspense } from "react";
import CheckRun from "@/components/CheckRun";
import { BUDGETS, CITIES, type City } from "@/lib/report";

export default function CheckPage({ searchParams }: PageProps<"/check">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<p className="text-muted">Loading your hustle check…</p>}>
        <CheckContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CheckContent({ searchParams }: Pick<PageProps<"/check">, "searchParams">) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  const idea = one(params.idea).slice(0, 300);
  const city = one(params.city) as City;
  const budget = one(params.budget);

  if (idea.length < 3 || !CITIES.includes(city)) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">That hustle check link is incomplete.</h1>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-lime px-5 py-3 font-bold text-ink">
          Pitch a hustle
        </Link>
      </div>
    );
  }

  return (
    <CheckRun
      key={`${idea}|${city}|${budget}`}
      input={{ idea, city, budget: (BUDGETS as readonly string[]).includes(budget) ? budget : undefined }}
    />
  );
}
