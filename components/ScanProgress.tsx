"use client";

import { useEffect, useState } from "react";

interface ScanProgressProps {
  running: boolean;
}

const STEPS = [
  "Schema.org",
  "llms.txt",
  "robots.txt",
  "Sitemap",
  "Heading-Struktur",
  "FAQ-Markup",
  "Ladezeit",
  "Meta-Tags",
];

const STEP_MS = 900;

export default function ScanProgress({ running }: ScanProgressProps) {
  const [done, setDone] = useState(0);

  // Reset beim Wechsel von `running` während des Renders ableiten, statt
  // setState direkt im Effekt aufzurufen (react-hooks/set-state-in-effect).
  const [prevRunning, setPrevRunning] = useState(running);
  if (running !== prevRunning) {
    setPrevRunning(running);
    setDone(0);
  }

  useEffect(() => {
    if (!running) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= STEPS.length; i++) {
      timers.push(
        setTimeout(() => setDone((d) => Math.max(d, i)), i * STEP_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [running]);

  return (
    <div
      className="mx-auto w-full max-w-md rounded-xl border border-line bg-surface/60 p-6 backdrop-blur-sm"
      aria-live="polite"
      aria-busy={running}
    >
      <div className="mb-4 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        <span>scan läuft</span>
        <span className="tabular-nums">
          {Math.min(done, STEPS.length)}/{STEPS.length}
        </span>
      </div>

      <ul className="space-y-2.5 font-mono text-sm">
        {STEPS.map((step, i) => {
          const isDone = i < done;
          const isActive = i === done;
          return (
            <li
              key={step}
              className="flex items-center gap-3 transition-opacity duration-500"
              style={{ opacity: isDone || isActive ? 1 : 0.32 }}
            >
              <span
                className="inline-grid h-5 w-5 place-items-center text-xs"
                style={{
                  color: isDone ? "var(--brand-light)" : "var(--faint)",
                }}
              >
                {isDone ? "✓" : "·"}
              </span>
              <span
                className={`${isDone ? "text-ink" : "text-muted"} ${
                  isActive ? "cursor-blink" : ""
                }`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
