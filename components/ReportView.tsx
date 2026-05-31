"use client";

import { useState } from "react";
import ScoreRing from "@/components/ScoreRing";
import CategoryCard from "@/components/CategoryCard";
import EmailGate from "@/components/EmailGate";
import { CATEGORY_LABELS, type Category, type ScanResult } from "@/components/types";

const CARD_ORDER: Category[] = ["technik", "auffindbarkeit", "content", "ki_sichtbarkeit"];

export default function ReportView({
  result,
  scanId,
  initiallyUnlocked = false,
  onReset,
}: {
  result: ScanResult;
  scanId: number;
  initiallyUnlocked?: boolean;
  onReset?: () => void;
}) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);

  const byCategory = new Map<Category, number>();
  for (const c of result.categories) byCategory.set(c.category, c.score);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <div className="animate-fade-up flex flex-col items-center text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">AEO-Report</p>
        <h1 className="mt-3 font-serif text-2xl font-medium text-ink sm:text-3xl">{result.domain}</h1>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 max-w-full truncate font-mono text-xs text-faint underline-offset-4 hover:underline"
        >
          {result.url}
        </a>
      </div>

      <div className="animate-fade-up mt-10 flex justify-center" style={{ animationDelay: "100ms" }}>
        <ScoreRing score={result.total} />
      </div>

      <div
        className="animate-fade-up mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
        style={{ animationDelay: "180ms" }}
      >
        {CARD_ORDER.map((cat) => (
          <CategoryCard
            key={cat}
            label={CATEGORY_LABELS[cat]}
            score={byCategory.get(cat) ?? 0}
            soon={cat === "ki_sichtbarkeit"}
          />
        ))}
      </div>

      <EmailGate
        scanId={scanId}
        checks={result.checks}
        unlocked={unlocked}
        onUnlock={() => setUnlocked(true)}
      />

      {onReset && (
        <div className="mt-14 flex justify-center border-t border-line pt-10">
          <button
            onClick={onReset}
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            ← Neue Seite scannen
          </button>
        </div>
      )}
    </div>
  );
}
