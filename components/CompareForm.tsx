"use client";

import Link from "next/link";
import { useState } from "react";
import type { CompareResult } from "@/lib/compare";
import { AUDIENCES, type AudienceKey } from "@/lib/report";
import { AffinityBar } from "./ui";

const EXAMPLES = [
  "Thrift streetwear pop-up",
  "Bubble tea stand",
  "Home nail salon",
  "Vintage sneaker resale",
];

export default function CompareForm() {
  const [idea, setIdea] = useState("");
  const [aud, setAud] = useState<AudienceKey>("genz");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tooShort = idea.trim().length < 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.trim(), audience: aud }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      setResult(body as CompareResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={submit} className="rounded-2xl border border-line bg-panel p-5 sm:p-7">
        <label htmlFor="idea" className="text-sm font-semibold">
          What&apos;s your hustle?
        </label>
        <input
          id="idea"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={300}
          placeholder="e.g. Thrift streetwear pop-up"
          className="mt-2 w-full rounded-xl border border-line bg-ink px-4 py-3 text-base text-fg placeholder:text-faint focus:border-lime focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setIdea(ex)}
              className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-violet-soft hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>

        <fieldset className="mt-6">
          <legend className="text-sm font-semibold">
            Who&apos;s it for? <span className="font-normal text-faint">(target audience)</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.key}
                type="button"
                aria-pressed={aud === a.key}
                onClick={() => setAud(a.key)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  aud === a.key ? "border-lime bg-lime text-ink" : "border-line text-muted hover:text-fg"
                }`}
              >
                {a.long}
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={tooShort || loading}
          className="mt-7 w-full rounded-xl bg-lime px-7 py-4 text-base font-black text-ink transition hover:brightness-110 enabled:glow-lime disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
        >
          {loading ? "Comparing cities…" : "Rank the cities →"}
        </button>
      </form>

      {error && (
        <div role="alert" className="mt-6 rounded-2xl border border-red-400/50 bg-panel p-5 text-sm text-muted">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 animate-pop-in rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2 className="text-base font-bold">Where it would pop most</h2>
          <p className="mb-5 mt-1 text-sm text-muted">
            Demand for <span className="text-fg">{idea}</span>, ranked across every city.
          </p>
          <ol className="space-y-4">
            {result.ranking.map((c, i) => (
              <li key={c.city}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="font-semibold">
                    <span className="mr-2 font-mono text-faint">{i + 1}</span>
                    {c.city}
                    {c.topNeighbourhood && (
                      <span className="ml-2 text-xs font-normal text-faint">hottest in {c.topNeighbourhood}</span>
                    )}
                  </span>
                  <Link
                    href={`/check?idea=${encodeURIComponent(idea.trim())}&city=${encodeURIComponent(c.city)}&audience=${aud}`}
                    className="shrink-0 text-xs font-semibold text-violet-soft hover:text-lime"
                  >
                    Full check →
                  </Link>
                </div>
                <AffinityBar value={c.score / 100} label={c.city} />
              </li>
            ))}
          </ol>
          {result.tags.length > 0 && (
            <p className="mt-5 text-xs text-faint">
              Matched to:{" "}
              {result.tags.map((t) => (
                <code key={t.id} className="mr-2 rounded bg-panel-2 px-1.5 py-0.5 text-violet-soft">
                  {t.name}
                </code>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
