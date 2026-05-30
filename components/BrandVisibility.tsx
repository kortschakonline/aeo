"use client";

type Q = { question: string; appeared: boolean; sources: string[] };

export type BrandVisibilityData = {
  brandName: string;
  score: number;
  questions: Q[];
  competitors: string[];
};

function accentFor(score: number): string {
  if (score >= 80) return "#5fb568"; // green / strong presence
  if (score >= 50) return "var(--brand-light)"; // orange / partial
  return "var(--brand)"; // red / weak
}

function shortenUrl(raw: string): string {
  let s = raw.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (s.length > 48) s = s.slice(0, 47) + "…";
  return s;
}

function SectionLabel() {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand-light">
          KI-Sichtbarkeit
        </p>
        <h2 className="mt-2 font-serif text-2xl font-medium leading-tight text-ink sm:text-3xl">
          Nennt dich die KI — oder die Konkurrenz?
        </h2>
      </div>
      <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-faint sm:block">
        live · websuche
      </span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <SectionLabel />
      {children}
    </section>
  );
}

function Loading() {
  return (
    <Shell>
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-8">
        <span
          className="pointer-events-none absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background:
              "linear-gradient(90deg, var(--brand-light), var(--brand), transparent)",
          }}
        />
        <div className="flex items-center gap-4">
          <span
            aria-hidden
            className="block h-5 w-5 shrink-0 rounded-full border-2 border-line-2 border-t-brand-light"
            style={{ animation: "ring-spin 0.9s linear infinite" }}
          />
          <p className="font-mono text-sm leading-relaxed text-muted">
            <span className="cursor-blink">
              Wir fragen KI-Antwortmaschinen mit Websuche … das dauert einen
              Moment
            </span>
          </p>
        </div>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-faint">
          Wir stellen echte Test-Fragen an Modelle mit Live-Websuche und prüfen,
          ob deine Marke in den Antworten auftaucht.
        </p>
      </div>
    </Shell>
  );
}

function Fallback() {
  return (
    <Shell>
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-8">
        <span
          className="pointer-events-none absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background: "linear-gradient(90deg, var(--brand-light), transparent)",
          }}
        />
        <p className="max-w-xl text-base leading-relaxed text-muted">
          Die KI-Sichtbarkeit konnte gerade nicht ermittelt werden — wir prüfen
          das im Erstgespräch.
        </p>
      </div>
    </Shell>
  );
}

function QuestionRow({ q, index }: { q: Q; index: number }) {
  const positive = q.appeared;
  return (
    <li
      className="animate-fade-up border-t border-line py-4 first:border-t-0"
      style={{ animationDelay: `${160 + index * 80}ms` }}
    >
      <div className="flex items-start gap-3">
        <span
          aria-label={positive ? "genannt" : "nicht genannt"}
          className="mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line-2 font-mono text-sm"
          style={{ color: positive ? "#5fb568" : "var(--faint)" }}
        >
          {positive ? "✓" : "✗"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-sans text-base leading-snug text-ink">
            {q.question}
          </p>
          {positive && q.sources.length > 0 && (
            <ul className="mt-2 space-y-1">
              {q.sources.map((src, i) => (
                <li
                  key={i}
                  className="truncate font-mono text-[11px] leading-relaxed text-faint"
                  title={src}
                >
                  {shortenUrl(src)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

export function BrandVisibility({
  data,
  loading,
  error,
}: {
  data: BrandVisibilityData | null;
  loading?: boolean;
  error?: boolean;
}) {
  if (loading && !data) return <Loading />;
  if (error || !data) return <Fallback />;

  const score = Math.max(0, Math.min(100, Math.round(data.score)));
  const accent = accentFor(score);
  const hits = data.questions.filter((q) => q.appeared).length;

  return (
    <Shell>
      {/* Score hero */}
      <div className="relative mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-8 sm:p-10">
        <span
          className="pointer-events-none absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background:
              "linear-gradient(90deg, var(--brand-light), var(--brand), transparent)",
          }}
        />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-end gap-2">
            <span
              className="font-mono text-6xl font-semibold tabular-nums leading-none sm:text-7xl"
              style={{ color: accent }}
            >
              {score}
            </span>
            <span className="mb-1 font-mono text-lg text-faint">%</span>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted sm:text-right">
            der Testfragen nennen{" "}
            <span className="font-sans font-medium text-ink">
              «{data.brandName}»
            </span>
            <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.18em] text-faint">
              {hits} von {data.questions.length} Antworten
            </span>
          </p>
        </div>

        <div
          className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`KI-Sichtbarkeit von ${data.brandName}`}
        >
          <span
            className="block h-full rounded-full transition-[width] duration-1000 ease-out"
            style={{ width: `${score}%`, background: accent }}
          />
        </div>
      </div>

      {/* Per-question results */}
      {data.questions.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface px-6 py-2 sm:px-8">
          <ul>
            {data.questions.map((q, i) => (
              <QuestionRow key={i} q={q} index={i} />
            ))}
          </ul>
        </div>
      )}

      {/* Competitors */}
      {data.competitors.length > 0 && (
        <div className="mt-5 rounded-2xl border border-line bg-bg-soft p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-light">
            Stattdessen sichtbar
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {data.competitors.map((c, i) => (
              <li
                key={i}
                className="rounded-md border border-line-2 px-3 py-1.5 font-mono text-[12px] text-muted"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Closing statement */}
      <blockquote className="mt-6 border-l-2 border-brand bg-bg-soft/40 py-1 pl-5">
        <p className="font-serif text-lg italic leading-relaxed text-ink sm:text-xl">
          Wir sorgen dafür, dass KI dich nennt — nicht die Konkurrenz.
        </p>
      </blockquote>
    </Shell>
  );
}
