import type { Metadata } from "next";
import { SITE } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Datenschutz – Kortschak AEO",
};

export default function DatenschutzPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-24">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          Rechtliches
        </p>
        <h1 className="mt-3 font-serif text-3xl font-medium text-ink sm:text-4xl">
          Datenschutzerklärung
        </h1>

        <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted">
          <p>
            Der Schutz deiner Daten ist uns wichtig. Wir verarbeiten
            personenbezogene Daten ausschließlich im Rahmen der gesetzlichen
            Bestimmungen (DSGVO, österr. DSG).
          </p>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Verantwortlicher
            </h2>
            <p className="mt-2 text-ink">{SITE.legalName}</p>
            <p>
              E-Mail:{" "}
              <a href={`mailto:${SITE.email}`} className="text-ink hover:underline">
                {SITE.email}
              </a>
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              AEO-Scan
            </h2>
            <p className="mt-2">
              Wenn du eine Domain prüfst, rufen wir die öffentlich erreichbare
              Webseite dieser Domain ab und werten technische sowie
              inhaltliche Merkmale aus. Die eingegebene Domain und das
              Scan-Ergebnis werden zur Bereitstellung des Reports gespeichert.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              E-Mail / Voll-Report
            </h2>
            <p className="mt-2">
              Gibst du deine E-Mail-Adresse ein, um den vollständigen Report
              freizuschalten, speichern wir diese, um dir die Auswertung
              bereitzustellen und dich bei Interesse zur AEO-Optimierung zu
              kontaktieren (Rechtsgrundlage: berechtigtes Interesse bzw.
              Einwilligung, Art. 6 Abs. 1 lit. a/f DSGVO). Du kannst der
              Nutzung jederzeit unter {SITE.email} widersprechen.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Auftragsverarbeiter
            </h2>
            <p className="mt-2">
              Für Hosting und KI-gestützte Analyse setzen wir Dienstleister ein
              (u. a. Hosting-Provider sowie Anthropic für die KI-Analyse). Mit
              diesen bestehen entsprechende Vereinbarungen zur
              Auftragsverarbeitung.
            </p>
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Deine Rechte
            </h2>
            <p className="mt-2">
              Du hast das Recht auf Auskunft, Berichtigung, Löschung,
              Einschränkung, Datenübertragbarkeit und Widerspruch sowie das
              Recht auf Beschwerde bei der Datenschutzbehörde.
            </p>
          </section>

          <p className="border-t border-line pt-6 text-xs text-faint">
            Hinweis: Dies ist ein Entwurf und ersetzt keine Rechtsberatung. Die
            Erklärung wird vor dem Marketing-Einsatz finalisiert.
          </p>
        </div>
      </div>
    </main>
  );
}
