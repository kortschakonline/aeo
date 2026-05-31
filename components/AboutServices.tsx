import { SITE } from "@/src/config/site";

const STEPS = [
  {
    no: "01",
    title: "Analysieren",
    body: "Der kostenlose Scan zeigt in Sekunden, wie gut KI-Antwortmaschinen deine Seite finden, verstehen und zitieren — mit konkretem Score und Befunden.",
  },
  {
    no: "02",
    title: "Optimieren",
    body: "Wir setzen die Maßnahmen um: strukturierte Daten, llms.txt, klare Inhalte, zitierfähige Antworten und alles, was KI braucht, um dich zu nennen.",
  },
  {
    no: "03",
    title: "Sichtbar bleiben",
    body: "AEO ist kein Einmal-Projekt. Wir behalten deine KI-Sichtbarkeit im Blick und halten dich vor der Konkurrenz.",
  },
];

export default function AboutServices() {
  return (
    <section className="relative overflow-hidden border-t border-line bg-surface">
      {/* Soft background glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/3 top-[-4rem] h-80 w-80 -translate-x-1/2 rounded-full blur-[110px]"
          style={{ background: "rgba(255,28,32,0.18)" }}
        />
        <div
          className="absolute bottom-[-5rem] right-1/4 h-80 w-80 translate-x-1/2 rounded-full blur-[120px]"
          style={{ background: "rgba(241,135,0,0.14)" }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
            Was wir machen
          </p>
          <h2 className="mt-4 font-serif text-3xl font-medium leading-[1.1] tracking-tight text-ink sm:text-4xl">
            Von <span className="italic text-faint">„unsichtbar"</span> zu{" "}
            <span className="italic text-brand">„wird zitiert".</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Immer mehr Menschen fragen nicht mehr Google, sondern ChatGPT,
            Perplexity &amp; Co. Wer dort nicht auftaucht, existiert für diese
            Nutzer nicht. Wir machen deine Marke KI-sichtbar — Schritt für
            Schritt und messbar.
          </p>
        </div>

        {/* Floating glass cards */}
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.no}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-7 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-1.5"
            >
              {/* glass sheen */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-white/[0.07] to-transparent"
              />
              <div className="relative flex flex-col gap-4">
                <span className="font-mono text-sm text-brand">{s.no}</span>
                <h3 className="font-serif text-xl font-medium text-ink">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Weitere Leistungen */}
        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
            Mehr von Kortschak
          </span>
          <ul className="flex flex-wrap gap-2">
            {SITE.services.map((s) => (
              <li
                key={s}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 font-mono text-xs text-muted backdrop-blur-sm"
              >
                {s}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
