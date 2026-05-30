"use client";

type Dim = { key: string; score: number; summary: string };

export type AiAnalysisData = {
  dimensions: Dim[];
  strengths: string[];
  improvements: string[];
  overallSummary: string;
};

const DIM_LABELS: Record<string, string> = {
  klarheit: "Klarheit",
  zitierfaehigkeit: "Zitierfähigkeit",
  antwortorientierung: "Antwort-Orientierung",
};

function accentFor(score: number): string {
  if (score >= 80) return "#5fb568"; // green-ish / positive
  if (score >= 50) return "var(--brand-light)"; // orange
  return "var(--brand)"; // red
}

function SectionLabel() {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-light">
          KI-Analyse
        </p>
        <h2 className="mt-2 font-serif text-2xl font-medium leading-tight text-ink sm:text-3xl">
          Wie eine KI deine Inhalte liest
        </h2>
      </div>
      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
        powered by Claude
      </span>
    </div>
  );
}

function DimensionRow({ dim, index }: { dim: Dim; index: number }) {
  const label = DIM_LABELS[dim.key] ?? dim.key;
  const score = Math.max(0, Math.min(100, Math.round(dim.score)));
  const accent = accentFor(dim.score);

  return (
    <div
      className="animate-fade-up border-t border-line py-5 first:border-t-0"
      style={{ animationDelay: `${120 + index * 90}ms` }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-sans text-base font-medium text-ink">{label}</h3>
        <div className="flex items-baseline gap-1">
          <span
            className="font-mono text-2xl font-semibold tabular-nums leading-none"
            style={{ color: accent }}
          >
            {score}
          </span>
          <span className="font-mono text-[11px] text-faint">/100</span>
        </div>
      </div>

      <div
        className="mt-3 h-1 w-full overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className="block h-full rounded-full transition-[width] duration-1000 ease-out"
          style={{ width: `${score}%`, background: accent }}
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-muted">{dim.summary}</p>
    </div>
  );
}

function Fallback() {
  return (
    <section className="mt-12">
      <SectionLabel />
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-8">
        <span
          className="absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background:
              "linear-gradient(90deg, var(--brand-light), transparent)",
          }}
        />
        <p className="max-w-xl text-base leading-relaxed text-muted">
          Die KI-Analyse ist gerade nicht verfügbar — wir senden dir die
          vollständige Auswertung per E-Mail.
        </p>
      </div>
    </section>
  );
}

export function AiAnalysis({
  data,
  error,
}: {
  data: AiAnalysisData | null;
  error?: boolean;
}) {
  if (error || !data) return <Fallback />;

  return (
    <section className="mt-12">
      <SectionLabel />

      {/* Dimensions */}
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface px-6 py-2 sm:px-8">
        <span
          className="pointer-events-none absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background:
              "linear-gradient(90deg, var(--brand-light), var(--brand), transparent)",
          }}
        />
        {data.dimensions.map((dim, i) => (
          <DimensionRow key={dim.key} dim={dim} index={i} />
        ))}
      </div>

      {/* Strengths + Recommendations */}
      {(data.strengths.length > 0 || data.improvements.length > 0) && (
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {data.strengths.length > 0 && (
            <div className="rounded-2xl border border-line bg-bg-soft p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-faint">
                Stärken
              </p>
              <ul className="mt-4 space-y-3">
                {data.strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm leading-relaxed text-ink/90"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 font-mono text-sm leading-none"
                      style={{ color: "#5fb568" }}
                    >
                      +
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.improvements.length > 0 && (
            <div className="rounded-2xl border border-line bg-bg-soft p-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-light">
                Empfehlungen
              </p>
              <ul className="mt-4 space-y-3">
                {data.improvements.map((s, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm leading-relaxed text-ink/90"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 font-mono text-sm leading-none text-brand-light"
                    >
                      →
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Closing statement */}
      {data.overallSummary && (
        <blockquote className="mt-6 border-l-2 border-brand bg-bg-soft/40 py-1 pl-5">
          <p className="font-serif text-lg italic leading-relaxed text-ink sm:text-xl">
            {data.overallSummary}
          </p>
        </blockquote>
      )}
    </section>
  );
}
