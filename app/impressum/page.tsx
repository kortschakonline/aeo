import type { Metadata } from "next";
import { SITE } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Impressum – Kortschak AEO",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 font-mono text-xs uppercase tracking-[0.15em] text-faint">
        {label}
      </dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

export default function ImpressumPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          Rechtliches
        </p>
        <h1 className="mt-3 font-serif text-3xl font-medium text-ink sm:text-4xl">
          Impressum
        </h1>
        <p className="mt-4 text-sm text-muted">
          Angaben gemäß § 5 ECG, § 14 UGB, § 25 MedienG.
        </p>

        <dl className="mt-10 space-y-3 text-sm leading-relaxed">
          <Row label="Medieninhaber" value={SITE.legalName} />
          <Row label="Geschäftsführung" value={SITE.managingDirector} />
          <Row label="Anschrift" value={`${SITE.street}, ${SITE.zipCity}, Österreich`} />
          <Row label="Telefon" value={SITE.phone} />
          <Row label="E-Mail" value={SITE.email} />
          <Row label="Web" value={SITE.web} />
          <Row label="UID-Nr." value={SITE.uid} />
          <Row label="Firmenbuch-Nr." value={SITE.registerNumber} />
          <Row label="Firmenbuchgericht" value={SITE.registerCourt} />
          <Row label="GLN" value={SITE.gln} />
          <Row label="Gewerbe" value={SITE.trade} />
          <Row label="Kammer" value={`Mitglied der ${SITE.chamber}`} />
          <Row label="Aufsichtsbehörde" value={SITE.supervisoryAuthority} />
        </dl>

        <div className="mt-12 space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Online-Streitbeilegung
            </h2>
            <p className="mt-2">
              Die EU-Kommission stellt eine Plattform zur
              Online-Streitbeilegung bereit:{" "}
              <a
                href="https://ec.europa.eu/consumers/odr"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:underline"
              >
                ec.europa.eu/consumers/odr
              </a>
              . Unsere E-Mail-Adresse findest du oben.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Haftung für Inhalte &amp; Links
            </h2>
            <p className="mt-2">
              Die Inhalte dieser Seiten wurden mit größtmöglicher Sorgfalt
              erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität der
              Inhalte können wir keine Gewähr übernehmen. Für die Inhalte
              externer Links sind ausschließlich deren Betreiber verantwortlich.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
