"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORY_LABELS, type Category, type Check } from "./types";
import { AiAnalysis, type AiAnalysisData } from "./AiAnalysis";
import {
  BrandVisibility,
  type BrandVisibilityData,
} from "./BrandVisibility";
import { SITE } from "@/src/config/site";

interface BrandResponse {
  brandVisibility?: BrandVisibilityData | null;
  error?: boolean;
}

interface LeadResponse {
  ok?: boolean;
  aiAnalysis?: AiAnalysisData | null;
  aiError?: boolean;
}

interface EmailGateProps {
  scanId: number;
  checks: Check[];
  onUnlock: () => void;
  unlocked: boolean;
}

const CATEGORY_ORDER: Category[] = [
  "technik",
  "auffindbarkeit",
  "content",
  "ki_sichtbarkeit",
];

function statusFor(score: number): { mark: string; color: string; aria: string } {
  if (score >= 0.8)
    return { mark: "✓", color: "#5fb568", aria: "bestanden" };
  if (score >= 0.5)
    return { mark: "△", color: "var(--brand-light)", aria: "teilweise" };
  return { mark: "✗", color: "var(--brand)", aria: "nicht bestanden" };
}

function groupChecks(checks: Check[]) {
  const map = new Map<string, Check[]>();
  for (const c of checks) {
    const arr = map.get(c.category) ?? [];
    arr.push(c);
    map.set(c.category, arr);
  }
  const ordered: { category: string; label: string; items: Check[] }[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (map.has(cat)) {
      ordered.push({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: map.get(cat)!,
      });
      map.delete(cat);
    }
  }
  for (const [cat, items] of map) {
    ordered.push({ category: cat, label: cat, items });
  }
  return ordered;
}

function CheckRow({ check }: { check: Check }) {
  const status = statusFor(check.score);
  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className="flex items-start gap-3">
        <span
          aria-label={status.aria}
          className="mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line-2 font-mono text-sm"
          style={{ color: status.color }}
        >
          {status.mark}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="font-sans text-base font-medium text-ink">
            {check.label}
          </h4>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            {check.detail}
          </p>
          {check.fix && (
            <p className="mt-2 flex gap-2 text-sm leading-relaxed text-ink/90">
              <span className="font-mono text-xs uppercase tracking-wider text-brand-light">
                Fix
              </span>
              <span className="text-muted">{check.fix}</span>
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default function EmailGate({
  scanId,
  checks,
  onUnlock,
  unlocked,
}: EmailGateProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AiAnalysisData | null>(null);
  const [aiError, setAiError] = useState(false);
  const [brand, setBrand] = useState<BrandVisibilityData | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandError, setBrandError] = useState(false);
  const brandRequested = useRef(false);

  const groups = useMemo(() => groupChecks(checks), [checks]);

  useEffect(() => {
    if (!unlocked || brandRequested.current) return;
    brandRequested.current = true;
    let active = true;
    setBrandLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/scan/${scanId}/brand`, {
          method: "POST",
        });
        const data: BrandResponse = await res.json().catch(() => ({}));
        if (!active) return;
        setBrand(data.brandVisibility ?? null);
        setBrandError(Boolean(data.error) || data.brandVisibility == null);
      } catch {
        if (!active) return;
        setBrandError(true);
      } finally {
        if (active) setBrandLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [unlocked, scanId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Bitte gib eine gültige E-Mail-Adresse ein.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId, email }),
      });
      if (!res.ok) {
        throw new Error("lead failed");
      }
      const data: LeadResponse = await res.json().catch(() => ({}));
      setAiAnalysis(data.aiAnalysis ?? null);
      setAiError(Boolean(data.aiError) || data.aiAnalysis == null);
      onUnlock();
    } catch {
      setError("Etwas ist schiefgelaufen. Bitte versuche es erneut.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="relative mt-12">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl font-medium text-ink sm:text-3xl">
          Detail-Report
        </h2>
        <span className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
          {checks.length} Checks
        </span>
      </div>

      <div className="relative">
        {/* The checks list — blurred when locked */}
        <div
          className={`space-y-8 transition-all duration-500 ${
            unlocked ? "" : "pointer-events-none select-none blur-[7px]"
          }`}
          aria-hidden={!unlocked}
        >
          {groups.map((group) => (
            <div
              key={group.category}
              className="overflow-hidden rounded-xl border border-line bg-surface"
            >
              <div className="flex items-center justify-between border-b border-line bg-bg-soft px-5 py-3">
                <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-ink">
                  {group.label}
                </h3>
              </div>
              <ul className="px-5">
                {group.items.map((c) => (
                  <CheckRow key={c.key} check={c} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Lock overlay */}
        {!unlocked && (
          <div className="absolute inset-0 grid place-items-center px-4">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/40 via-bg/70 to-bg" />
            <div className="animate-fade-up relative w-full max-w-md rounded-2xl border border-line-2 bg-surface/95 p-8 shadow-2xl backdrop-blur-md">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand">
                gesperrt
              </p>
              <h3 className="mt-3 font-serif text-2xl font-medium leading-tight text-ink">
                Sieh, was die KI an deiner Seite bemängelt
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Alle {checks.length} Einzel-Checks mit konkreten Befunden und
                Empfehlungen. Trag deine E-Mail ein, um den vollständigen Report
                freizuschalten.
              </p>
              <form onSubmit={handleSubmit} className="mt-5 space-y-3">
                <label htmlFor="gate-email" className="sr-only">
                  E-Mail-Adresse
                </label>
                <input
                  id="gate-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="name@firma.de"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-line-2 bg-bg px-4 py-3 font-mono text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-brand"
                />
                {error && (
                  <p className="font-mono text-xs text-brand">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-5 py-3 font-sans text-sm font-semibold text-ink transition-all hover:bg-brand-alt disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Wird freigeschaltet…" : "Voll-Report freischalten"}
                </button>
                <p className="text-center font-mono text-[11px] leading-relaxed text-faint">
                  Kein Spam · jederzeit abbestellbar
                  <br />
                  Mit dem Absenden stimmst du der Verarbeitung deiner E-Mail
                  gemäß{" "}
                  <a
                    href="/datenschutz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 transition-colors hover:text-ink"
                  >
                    Datenschutz
                  </a>{" "}
                  zu.
                </p>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* AI content analysis — between detailed checks and the CTA */}
      {unlocked && <AiAnalysis data={aiAnalysis} error={aiError} />}

      {/* Brand-Visibility — slow live web-search block, after AI analysis */}
      {unlocked && (
        <BrandVisibility
          data={brand}
          loading={brandLoading}
          error={brandError}
        />
      )}

      {/* CTA after unlock */}
      {unlocked && (
        <div className="animate-fade-up mt-12 overflow-hidden rounded-2xl border border-line-2 bg-bg-soft">
          <div className="relative p-8 sm:p-12">
            <span
              className="absolute left-0 top-0 h-px w-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--brand), var(--brand-light), transparent)",
              }}
            />
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-brand-light">
              nächster schritt
            </p>
            <h3 className="mt-3 max-w-2xl font-serif text-3xl font-medium leading-[1.1] text-ink sm:text-4xl">
              Wir bringen deine Seite auf 100 — kostenloses Erstgespräch
            </h3>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
              Wir setzen die Empfehlungen mit dir um, damit ChatGPT, Perplexity
              und Google AI deine Inhalte finden und zitieren.
            </p>
            <a
              href={`mailto:${SITE.email}?subject=AEO%20Erstgespr%C3%A4ch`}
              className="mt-7 inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3.5 font-sans text-sm font-semibold text-bg transition-colors hover:bg-brand-light"
            >
              Erstgespräch anfragen
              <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
