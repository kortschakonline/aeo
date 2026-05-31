import Link from "next/link";
import { SITE } from "@/src/config/site";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  const hasContact = Boolean(SITE.street || SITE.phone || SITE.email);

  return (
    <footer className="mt-auto border-t border-line bg-bg-soft">
      <div className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="max-w-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/Logo_Kortschak_mono_weiss.svg"
              alt="Kortschak"
              className="h-6 w-auto"
            />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              {SITE.tagline}
            </p>
          </div>

          {/* Kontakt */}
          {hasContact && (
            <div className="font-mono text-xs leading-relaxed text-muted">
              <p className="mb-2 uppercase tracking-[0.2em] text-faint">Kontakt</p>
              {SITE.street && <p>{SITE.street}</p>}
              {SITE.zipCity && <p>{SITE.zipCity}</p>}
              {SITE.phone && (
                <p className="mt-2">
                  <a href={`tel:${SITE.phone.replace(/\s/g, "")}`} className="hover:text-ink">
                    {SITE.phone}
                  </a>
                </p>
              )}
              {SITE.email && (
                <p>
                  <a href={`mailto:${SITE.email}`} className="hover:text-ink">
                    {SITE.email}
                  </a>
                </p>
              )}
            </div>
          )}

          {/* Rechtliches */}
          <nav className="flex flex-col gap-2 font-mono text-xs text-muted">
            <span className="uppercase tracking-[0.2em] text-faint">Rechtliches</span>
            <Link href="/impressum" className="transition-colors hover:text-ink">
              Impressum
            </Link>
            <Link href="/datenschutz" className="transition-colors hover:text-ink">
              Datenschutz
            </Link>
          </nav>
        </div>

        <div className="mt-10 flex flex-col items-center gap-4 border-t border-line pt-6 sm:flex-row sm:justify-between">
          <p className="font-mono text-[11px] text-faint">
            © {year} {SITE.brand}. Alle Rechte vorbehalten.
          </p>
          <div className="flex items-center gap-2 font-mono text-[11px] text-faint">
            <span>entwickelt von</span>
            <a
              href="https://jrn.digital"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="jrn.digital"
              className="transition-opacity hover:opacity-100 opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/JRN.digital-Logo-white.svg"
                alt="jrn.digital"
                className="h-4 w-auto"
              />
            </a>
            <span>· mit Claude</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
