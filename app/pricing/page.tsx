import Link from "next/link";
import { getSession } from "@/src/auth/session";
import UpgradeButton from "@/components/UpgradeButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = [
  {
    name: "Gratis",
    price: "€0",
    plan: null as null | "klein" | "gross",
    features: ["Anonymer Schnupper-Scan", "Konto + Scan-Verlauf", "Kein Monitoring"],
  },
  {
    name: "Klein",
    price: "€19",
    plan: "klein" as const,
    features: ["1 überwachte Domain", "Wöchentliches Monitoring", "E-Mail bei Score-Änderung"],
  },
  {
    name: "Groß",
    price: "€49",
    plan: "gross" as const,
    features: ["Bis zu 10 Domains", "Wöchentliches Monitoring", "Auto-Brand-Visibility", "PDF-Export"],
  },
];

export default async function PricingPage() {
  const session = await getSession();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <div className="text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Preise</p>
        <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Wähle deinen Plan</h1>
        <p className="mt-2 text-sm text-muted">Monatlich kündbar. Preise inkl. USt.</p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {TIERS.map((t) => (
          <section key={t.name} className="flex flex-col rounded-xl border border-line bg-surface p-6">
            <h2 className="font-serif text-xl font-medium text-ink">{t.name}</h2>
            <p className="mt-1 font-mono text-2xl text-ink">
              {t.price}
              <span className="text-sm text-faint"> / Monat</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2 text-sm text-muted">
              {t.features.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
            <div className="mt-6">
              {t.plan === null ? (
                <Link
                  href={session ? "/dashboard" : "/login"}
                  className="block rounded-lg border border-line px-6 py-3 text-center text-sm font-semibold text-ink hover:border-brand"
                >
                  {session ? "Zum Dashboard" : "Kostenlos starten"}
                </Link>
              ) : session ? (
                <UpgradeButton
                  plan={t.plan}
                  label={`${t.name} wählen`}
                  className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-brand-alt disabled:opacity-60"
                />
              ) : (
                <Link
                  href="/login"
                  className="block rounded-lg bg-brand px-6 py-3 text-center text-sm font-semibold text-ink hover:bg-brand-alt"
                >
                  Anmelden & wählen
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
