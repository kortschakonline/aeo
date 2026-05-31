import type { Metadata } from "next";
import { SITE } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Datenschutz – Kortschak AEO",
};

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
      {children}
    </h2>
  );
}

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

        <div className="mt-10 space-y-7 text-sm leading-relaxed text-muted">
          <p>
            Der Schutz deiner Daten ist uns wichtig. Wir verarbeiten
            personenbezogene Daten ausschließlich im Rahmen der gesetzlichen
            Bestimmungen (DSGVO, österreichisches DSG). Diese Erklärung gilt für
            das AEO-Tool unter aeo.kortschak.online.
          </p>

          <section>
            <H2>Verantwortlicher</H2>
            <p className="mt-2 text-ink">{SITE.legalName}</p>
            <p>
              {SITE.street}, {SITE.zipCity}, Österreich
            </p>
            <p>
              E-Mail:{" "}
              <a href={`mailto:${SITE.email}`} className="text-ink hover:underline">
                {SITE.email}
              </a>
            </p>
          </section>

          <section>
            <H2>Server-Logs</H2>
            <p className="mt-2">
              Beim Aufruf der Seite werden technisch notwendige Daten
              (IP-Adresse, Browser, Betriebssystem, Zeitpunkt des Zugriffs)
              automatisch verarbeitet und nur kurzzeitig zur Sicherstellung des
              Betriebs und der Sicherheit gespeichert (Art. 6 Abs. 1 lit. f
              DSGVO).
            </p>
          </section>

          <section>
            <H2>AEO-Scan</H2>
            <p className="mt-2">
              Wenn du eine Domain prüfst, rufen wir die öffentlich erreichbare
              Webseite dieser Domain ab und werten technische sowie inhaltliche
              Merkmale aus. Die eingegebene Domain und das Scan-Ergebnis werden
              zur Bereitstellung des Reports gespeichert.
            </p>
          </section>

          <section>
            <H2>E-Mail / Voll-Report</H2>
            <p className="mt-2">
              Gibst du deine E-Mail-Adresse ein, um den vollständigen Report
              freizuschalten, speichern wir diese, um dir die Auswertung
              bereitzustellen und dich bei Interesse zur AEO-Optimierung zu
              kontaktieren (Art. 6 Abs. 1 lit. a und f DSGVO). Du kannst dem
              jederzeit unter {SITE.email} bzw. {SITE.inquiryEmail}{" "}
              widersprechen.
            </p>
          </section>

          <section>
            <H2>Auftragsverarbeiter</H2>
            <p className="mt-2">
              Für Hosting, Versand und KI-gestützte Analyse setzen wir
              Dienstleister ein – insbesondere unseren Hosting-Provider sowie
              Anthropic (Claude) für die KI-Analyse. Mit diesen bestehen
              Vereinbarungen zur Auftragsverarbeitung gemäß Art. 28 DSGVO.
            </p>
          </section>

          <section>
            <H2>Schriftarten</H2>
            <p className="mt-2">
              Schriftarten werden lokal von unserem Server ausgeliefert
              (self-hosted). Es werden dabei keine Daten an Dritte übertragen.
              Dieses Tool nutzt kein Google&nbsp;Analytics, keine Werbe-Pixel
              und keine Tracking-Cookies.
            </p>
          </section>

          <section>
            <H2>Nutzerkonten &amp; Login</H2>
            <p className="mt-2">
              Wer ein Konto anlegt, wird per Magic-Link angemeldet: Wir senden
              einen einmaligen Login-Link an die angegebene E-Mail-Adresse. Wir
              speichern dazu die E-Mail-Adresse, Zeitpunkte von Erstellung und
              letztem Login sowie kurzlebige Login-Tokens (15&nbsp;Minuten
              gültig). Für die Anmeldung setzen wir ein technisch notwendiges
              Session-Cookie (<code>aeo_session</code>, HttpOnly, 30&nbsp;Tage)
              — dieses dient ausschließlich dem eingeloggten Zustand und
              erfordert keine Einwilligung. Einem Konto werden die mit derselben
              E-Mail durchgeführten Scans zugeordnet, damit der Verlauf sichtbar
              ist.
            </p>
          </section>

          <section>
            <H2>Löschung</H2>
            <p className="mt-2">
              Du kannst dein Konto jederzeit im Dashboard löschen. Dabei werden
              E-Mail-Adresse, Sitzungen, Login-Tokens und die zugehörigen
              Lead-Einträge entfernt; verbleibende Scan-Daten (Domain und Score)
              werden anonymisiert und sind danach keiner Person mehr zuordenbar.
            </p>
          </section>

          <section>
            <H2>Monitoring</H2>
            <p className="mt-2">
              Aktivierst du für eine Domain das Monitoring, scannen wir diese
              Domain regelmäßig (wöchentlich) automatisch erneut und speichern
              das Ergebnis in deinem Konto. Ändert sich der Gesamt-Score
              gegenüber dem letzten Lauf, senden wir eine E-Mail an deine
              Konto-Adresse. Du kannst das Monitoring pro Domain jederzeit im
              Dashboard wieder deaktivieren.
            </p>
          </section>

          <section>
            <H2>Deine Rechte</H2>
            <p className="mt-2">
              Du hast das Recht auf Auskunft, Berichtigung, Löschung,
              Einschränkung der Verarbeitung, Datenübertragbarkeit und
              Widerspruch (Art. 15–22 DSGVO). Außerdem hast du das Recht auf
              Beschwerde bei der österreichischen Datenschutzbehörde (
              <a
                href="https://www.dsb.gv.at"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ink hover:underline"
              >
                dsb.gv.at
              </a>
              ).
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
