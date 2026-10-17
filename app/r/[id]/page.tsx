import type { Metadata } from "next";
import Link from "next/link";
import { cache, Suspense } from "react";
import ReportView from "@/components/ReportView";
import { loadReport } from "@/lib/store";

// One Redis read per request, shared by the metadata and the page.
const getReport = cache(loadReport);

export async function generateMetadata({ params }: PageProps<"/r/[id]">): Promise<Metadata> {
  const report = await getReport((await params).id);
  if (!report) return { title: "Report not found — HustlePulse" };
  const title = `PulseScore ${report.pulseScore}: ${report.input.idea} in ${report.input.city} — HustlePulse`;
  const description = report.plan.headline;
  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function SharedReportPage({ params }: PageProps<"/r/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
      <Suspense fallback={<p className="text-muted">Loading report…</p>}>
        <SharedReport params={params} />
      </Suspense>
    </main>
  );
}

async function SharedReport({ params }: Pick<PageProps<"/r/[id]">, "params">) {
  const report = await getReport((await params).id);
  if (!report) {
    return (
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">This report doesn&apos;t exist or has expired.</h1>
        <p className="mt-2 text-muted">Shared reports are kept for 90 days.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-lime px-5 py-3 font-bold text-ink">
          Check a hustle
        </Link>
      </div>
    );
  }
  return <ReportView report={report} shared />;
}
