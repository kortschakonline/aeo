"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import ScanProgress from "@/components/ScanProgress";
import AboutServices from "@/components/AboutServices";
import ReportView from "@/components/ReportView";
import type { ScanResult } from "@/components/types";

type Phase = "idle" | "scanning" | "result" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanId, setScanId] = useState<number | null>(null);
  const [owned, setOwned] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  async function handleScan(url: string) {
    setPhase("scanning");
    setResult(null);
    setScanId(null);
    setOwned(false);
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
      setOwned(Boolean(data.owned));
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
    setOwned(false);
    setErrorMsg("");
  }

  if (phase === "idle") {
    return (
      <main className="flex flex-1 flex-col">
        <Hero onScan={handleScan} loading={false} />
        <AboutServices />
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

  return (
    <main className="flex flex-1 flex-col">
      <ReportView
        result={result}
        scanId={scanId}
        initiallyUnlocked={owned}
        onReset={reset}
      />
    </main>
  );
}
