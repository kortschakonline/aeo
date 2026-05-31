import type { Metadata } from "next";
import { SITE } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Impressum – Kortschak AEO",
};

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

        <div className="mt-10 space-y-6 text-sm leading-relaxed text-muted">
          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Medieninhaber &amp; Diensteanbieter
            </h2>
            <p className="mt-2 text-ink">{SITE.legalName}</p>
            {SITE.street && <p>{SITE.street}</p>}
            {SITE.zipCity && <p>{SITE.zipCity}</p>}
          </section>

          <section>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
              Kontakt
            </h2>
            {SITE.phone && <p className="mt-2">Tel: {SITE.phone}</p>}
            <p>
              E-Mail:{" "}
              <a href={`mailto:${SITE.email}`} className="text-ink hover:underline">
                {SITE.email}
              </a>
            </p>
            <p>Web: {SITE.web}</p>
          </section>

          {SITE.uid && (
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
                Unternehmensdaten
              </h2>
              <p className="mt-2">UID/Firmenbuch: {SITE.uid}</p>
              {SITE.authority && <p>Behörde/Kammer: {SITE.authority}</p>}
            </section>
          )}

          <p className="border-t border-line pt-6 text-xs text-faint">
            Hinweis: Dies ist ein Entwurf. Die Angaben werden mit den
            offiziellen Unternehmensdaten finalisiert.
          </p>
        </div>
      </div>
    </main>
  );
}
