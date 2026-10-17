"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AUDIENCES, BUDGETS, CITIES, type AudienceKey, type City } from "@/lib/report";

const EXAMPLES = [
  "Thrift streetwear pop-up for university students",
  "Late-night jollof and small chops delivery",
  "Home nail salon with Afrobeats playlists",
  "Bubble tea stand at weekend markets",
];

export default function PitchForm() {
  const router = useRouter();
  const [idea, setIdea] = useState("");
  const [city, setCity] = useState<City>("Lagos");
  const [aud, setAud] = useState<AudienceKey>("genz");
  const [budget, setBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const tooShort = idea.trim().length < 3;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort) return;
    setSubmitting(true);
    const params = new URLSearchParams({ idea: idea.trim(), city, audience: aud });
    if (budget) params.set("budget", budget);
    router.push(`/check?${params}`);
  }

  return (
    <form onSubmit={submit} className="mt-10 rounded-2xl border border-line bg-panel p-5 sm:p-7">
      <label htmlFor="idea" className="text-sm font-semibold">
        What&apos;s your hustle?
      </label>
      <textarea
        id="idea"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        maxLength={300}
        rows={3}
        placeholder="e.g. Thrift streetwear pop-up for university students"
        className="mt-2 w-full resize-none rounded-xl border border-line bg-ink px-4 py-3 text-base text-fg placeholder:text-faint focus:border-lime focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setIdea(example)}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-violet-soft hover:text-fg"
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-5">
        <fieldset>
          <legend className="text-sm font-semibold">City</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={city === c}
                onClick={() => setCity(c)}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  city === c ? "border-lime bg-lime text-ink" : "border-line text-muted hover:text-fg"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
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
                title={a.long}
                className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition ${
                  aud === a.key ? "border-lime bg-lime text-ink" : "border-line text-muted hover:text-fg"
                }`}
              >
                {a.long}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="sm:max-w-xs">
          <label htmlFor="budget" className="text-sm font-semibold">
            Starting budget <span className="font-normal text-faint">(optional)</span>
          </label>
          <select
            id="budget"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-2 w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm text-fg focus:border-lime focus:outline-none"
          >
            <option value="">Not sure yet</option>
            {BUDGETS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={tooShort || submitting}
        className="mt-7 w-full rounded-xl bg-lime px-7 py-4 text-base font-black text-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 enabled:glow-lime sm:w-auto"
      >
        {submitting ? "Reading the vibe…" : "Check my hustle →"}
      </button>
    </form>
  );
}
