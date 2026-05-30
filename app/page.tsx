"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import ScanProgress from "@/components/ScanProgress";
import ScoreRing from "@/components/ScoreRing";
import CategoryCard from "@/components/CategoryCard";
import EmailGate from "@/components/EmailGate";
import {
  CATEGORY_LABELS,
  type Category,
  type ScanResult,
} from "@/components/types";

type Phase = "idle" | "scanning" | "result" | "error";

const CARD_ORDER: Category[] = [
  "technik",
  "auffindbarkeit",
  "content",
  "ki_sichtbarkeit",
];

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanId, setScanId] = useState<number | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleScan(url: string) {
    setPhase("scanning");
    setResult(null);
    setScanId(null);
    setUnlocked(false);
    setErrorMsg("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Scan fehlgeschlagen");
      }
      setResult(data.result as ScanResult);
      setScanId(data.id as number);
      setPhase("result");
    } catch (e) {
      setErrorMsg(
        e instanceof Error
          ? e.message
          : "Der Scan konnte nicht abgeschlossen werden.",
      );
      setPhase("error");
    }
  }

  function reset() {
    setPhase("idle");
    setResult(null);
    setScanId(null);
    setUnlocked(false);
    setErrorMsg("");
  }

  if (phase === "idle") {
    return (
      <main className="flex flex-1 flex-col">
        <Hero onScan={handleScan} loading={false} />
      </main>
    );
  }

  if (phase === "scanning") {
    return (
      <main className="flex flex-1 flex-col">
        <Hero onScan={handleScan} loading compact />
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <p className="mb-8 text-center text-sm text-muted">
            Wir analysieren deine Seite aus Sicht der KI-Suchmaschinen.
          </p>
          <ScanProgress running />
        </div>
      </main>
    );
  }

  if (phase === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6">
        <div className="animate-fade-up w-full max-w-md text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
            Fehler
          </p>
          <h1 className="mt-4 font-serif text-3xl font-medium text-ink">
            Das hat nicht geklappt
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {errorMsg ||
              "Wir konnten die Seite gerade nicht scannen. Prüfe die URL und versuch es noch einmal."}
          </p>
          <button
            onClick={reset}
            className="mt-7 rounded-lg bg-brand px-6 py-3 font-sans text-sm font-semibold text-ink transition-colors hover:bg-brand-alt"
          >
            Erneut versuchen
          </button>
        </div>
      </main>
    );
  }

  // result
  if (!result || scanId === null) return null;

  const byCategory = new Map<Category, number>();
  for (const c of result.categories) byCategory.set(c.category, c.score);

  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
        {/* Header */}
        <div className="animate-fade-up flex flex-col items-center text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
            AEO-Report
          </p>
          <h1 className="mt-3 font-serif text-2xl font-medium text-ink sm:text-3xl">
            {result.domain}
          </h1>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 max-w-full truncate font-mono text-xs text-faint underline-offset-4 hover:underline"
          >
            {result.url}
          </a>
        </div>

        {/* Score ring */}
        <div
          className="animate-fade-up mt-10 flex justify-center"
          style={{ animationDelay: "100ms" }}
        >
          <ScoreRing score={result.total} />
        </div>

        {/* Category cards */}
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

        {/* Email gate + checks */}
        <EmailGate
          scanId={scanId}
          checks={result.checks}
          unlocked={unlocked}
          onUnlock={() => setUnlocked(true)}
        />

        {/* Reset */}
        <div className="mt-14 flex justify-center border-t border-line pt-10">
          <button
            onClick={reset}
            className="font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            ← Neue Seite scannen
          </button>
        </div>
      </div>
    </main>
  );
}
