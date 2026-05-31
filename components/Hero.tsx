"use client";

import { useState } from "react";

interface HeroProps {
  onScan: (url: string) => void;
  loading: boolean;
  compact?: boolean;
}

export default function Hero({ onScan, loading, compact }: HeroProps) {
  const [url, setUrl] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed.length < 3) return;
    onScan(trimmed);
  }

  if (compact) {
    return (
      <section className="mx-auto w-full max-w-3xl px-6 pt-16 text-center sm:pt-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          AEO Score Check
        </p>
        <h1 className="mt-4 font-serif text-4xl font-medium leading-[1.05] tracking-tight text-ink sm:text-5xl">
          Findet die KI deine Website?
        </h1>
      </section>
    );
  }

  return (
    <section className="relative flex min-h-[calc(100svh-3.5rem)] flex-col items-center justify-center overflow-hidden px-6 py-20">
      {/* Atmospheric radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(255,28,32,0.10), transparent 70%), radial-gradient(40% 40% at 80% 90%, rgba(241,135,0,0.08), transparent 70%)",
        }}
      />
      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(70% 60% at 50% 40%, black, transparent 90%)",
          WebkitMaskImage:
            "radial-gradient(70% 60% at 50% 40%, black, transparent 90%)",
        }}
      />

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center text-center">
        <div className="animate-fade-up flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand" />
          Answer Engine Optimization
        </div>

        <h1
          className="animate-fade-up mt-6 font-serif text-[clamp(2.75rem,9vw,6.5rem)] font-medium leading-[0.95] tracking-[-0.02em] text-ink"
          style={{ animationDelay: "60ms" }}
        >
          Findet die KI
          <br />
          <span className="italic text-brand">deine Website?</span>
        </h1>

        <p
          className="animate-fade-up mt-7 max-w-xl text-balance text-lg leading-relaxed text-muted"
          style={{ animationDelay: "140ms" }}
        >
          AEO ist das neue SEO. Wir prüfen in Sekunden, ob ChatGPT, Perplexity
          und Google AI deine Seite finden, verstehen und zitieren können.
        </p>

        <form
          onSubmit={handleSubmit}
          className="animate-fade-up mt-10 flex w-full max-w-xl flex-col gap-3 sm:flex-row"
          style={{ animationDelay: "220ms" }}
        >
          <label htmlFor="hero-url" className="sr-only">
            Website-URL
          </label>
          <input
            id="hero-url"
            type="text"
            inputMode="url"
            autoComplete="url"
            placeholder="deine-website.de"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={loading}
            className="h-14 flex-1 rounded-xl border border-line-2 bg-surface/70 px-5 font-mono text-base text-ink placeholder:text-faint outline-none backdrop-blur-sm transition-colors focus:border-brand disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || url.trim().length < 3}
            className="h-14 shrink-0 rounded-xl bg-brand px-7 font-sans text-base font-semibold text-ink transition-all hover:bg-brand-alt disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Scan läuft…" : "Scan starten"}
          </button>
        </form>

        <p
          className="animate-fade-up mt-5 font-mono text-xs tracking-wide text-faint"
          style={{ animationDelay: "300ms" }}
        >
          Kostenlos · ~15 Sekunden · keine Anmeldung
        </p>
      </div>
    </section>
  );
}
