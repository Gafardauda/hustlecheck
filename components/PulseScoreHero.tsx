"use client";

import { useEffect, useRef, useState } from "react";
import { scoreVerdict } from "@/lib/score";

/** The big reveal: a number that counts up, a ring that fills, an emoji verdict and a hype line. */
export default function PulseScoreHero({ score, city }: { score: number; city: string }) {
  const verdict = scoreVerdict(score, city);
  const [shown, setShown] = useState(0);
  const prefersReduced = useRef(false);

  useEffect(() => {
    prefersReduced.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced.current) {
      setShown(score);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setShown(Math.round(eased * score));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const r = 76;
  const circumference = 2 * Math.PI * r;
  const toneRing = verdict.tone === "weak" ? "var(--color-violet-soft)" : "var(--color-lime)";

  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Your PulseScore</p>
      <div className="relative mt-4">
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          role="img"
          aria-label={`PulseScore ${score} out of 100: ${verdict.label}`}
          className={verdict.tone !== "weak" ? "animate-pulse-ring" : undefined}
        >
          <circle cx="100" cy="100" r={r} fill="none" stroke="var(--color-line)" strokeWidth="14" />
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke={toneRing}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown / 100)}
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dashoffset 80ms linear", filter: "drop-shadow(0 0 10px rgba(198,255,61,0.35))" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-7xl font-black tabular-nums leading-none">{shown}</span>
          <span className="mt-1 text-xs text-faint">out of 100</span>
        </div>
      </div>
      <p
        className={`mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold ${
          verdict.tone === "strong"
            ? "bg-lime text-ink"
            : verdict.tone === "promising"
              ? "bg-violet text-fg"
              : "border border-line text-muted"
        }`}
      >
        <span aria-hidden>{verdict.emoji}</span>
        {verdict.label}
      </p>
      <p className="mt-3 max-w-[16rem] text-sm text-muted">{verdict.blurb}</p>
    </div>
  );
}
