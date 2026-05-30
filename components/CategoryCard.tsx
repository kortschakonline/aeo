"use client";

interface CategoryCardProps {
  label: string;
  score: number;
  soon?: boolean;
}

function accentFor(score: number): string {
  if (score >= 80) return "#5fb568"; // green-ish
  if (score >= 50) return "var(--brand-light)"; // orange
  return "var(--brand)"; // red
}

export default function CategoryCard({ label, score, soon }: CategoryCardProps) {
  const accent = accentFor(score);

  return (
    <div
      className={`group relative overflow-hidden rounded-xl border border-line bg-surface p-5 transition-colors duration-300 ${
        soon ? "opacity-55" : "hover:border-line-2"
      }`}
    >
      {/* top accent hairline */}
      {!soon && (
        <span
          className="absolute left-0 top-0 h-px w-full opacity-60"
          style={{
            background: `linear-gradient(90deg, ${accent}, transparent)`,
          }}
        />
      )}

      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
          {label}
        </span>
        {soon && (
          <span className="rounded-full border border-line-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-faint">
            bald verfügbar
          </span>
        )}
      </div>

      {soon ? (
        <div className="mt-4 font-mono text-3xl font-semibold text-faint">
          —
        </div>
      ) : (
        <div className="mt-3 flex items-end gap-1">
          <span
            className="font-mono text-4xl font-semibold tabular-nums leading-none"
            style={{ color: accent }}
          >
            {Math.round(score)}
          </span>
          <span className="mb-0.5 font-mono text-xs text-faint">/100</span>
        </div>
      )}

      {!soon && (
        <div className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line">
          <span
            className="block h-full rounded-full transition-[width] duration-1000 ease-out"
            style={{
              width: `${Math.max(0, Math.min(100, score))}%`,
              background: accent,
            }}
          />
        </div>
      )}
    </div>
  );
}
