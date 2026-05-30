"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number;
}

const SIZE = 240;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function ScoreRing({ score }: ScoreRingProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const [progress, setProgress] = useState(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setProgress(clamped), 120);
    return () => clearTimeout(t);
  }, [clamped]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 1400;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * clamped));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const offset = CIRCUMFERENCE - (progress / 100) * CIRCUMFERENCE;

  return (
    <div
      className="relative inline-grid place-items-center"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={`AEO-Score: ${clamped} von 100`}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="-rotate-90"
      >
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brand)" />
            <stop offset="100%" stopColor="var(--brand-light)" />
          </linearGradient>
        </defs>
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--line-2)"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          style={{
            transition:
              "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="font-mono text-6xl font-semibold tabular-nums tracking-tight text-ink">
            {display}
          </div>
          <div className="mt-1 font-mono text-xs uppercase tracking-[0.25em] text-faint">
            von 100
          </div>
        </div>
      </div>
    </div>
  );
}
