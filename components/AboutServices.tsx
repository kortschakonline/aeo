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
    <section className="border-t border-line bg-bg-soft">
      <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-28">
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
            Nutzer nicht. Wir machen deine Marke KI-sichtbar — messbar.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.no} className="flex flex-col gap-4 bg-surface p-7">
              <span className="font-mono text-sm text-brand">{s.no}</span>
              <h3 className="font-serif text-xl font-medium text-ink">
                {s.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted">{s.body}</p>
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
                className="rounded-full border border-line-2 px-4 py-1.5 font-mono text-xs text-muted"
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
