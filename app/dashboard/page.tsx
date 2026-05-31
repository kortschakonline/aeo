import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/src/auth/session";
import { getAccountScans, getMonitorsForAccount, getAccountPlan, getSubscription } from "@/src/db/repo";
import ScoreRing from "@/components/ScoreRing";
import Sparkline from "@/components/Sparkline";
import RescanButton from "@/components/RescanButton";
import AccountMenu from "@/components/AccountMenu";
import MonitorToggle from "@/components/MonitorToggle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScanRow = {
  id: number;
  url: string;
  domain: string;
  total: number;
  createdAt: Date;
};

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const rows = (await getAccountScans(session.accountId)) as ScanRow[];

  const monitorList = await getMonitorsForAccount(session.accountId);
  const monitorByDomain = new Map(monitorList.map((m) => [m.domain, m]));

  const plan = await getAccountPlan(session.accountId);
  const hasSubscription = (await getSubscription(session.accountId)) !== null;

  const byDomain = new Map<string, ScanRow[]>();
  for (const r of rows) {
    const list = byDomain.get(r.domain) ?? [];
    list.push(r);
    byDomain.set(r.domain, list);
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <div className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Dashboard</p>
          <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Deine Domains</h1>
        </div>
        <AccountMenu email={session.email} plan={plan} hasSubscription={hasSubscription} />
      </div>

      {byDomain.size === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-sm text-muted">Noch keine Scans.</p>
          <Link href="/" className="mt-4 inline-block rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-ink hover:bg-brand-alt">
            Erste Seite scannen
          </Link>
        </div>
      ) : (
        <div className="mt-10 flex flex-col gap-8">
          {[...byDomain.entries()].map(([domain, scans]) => {
            const latest = scans[0];
            const trend = [...scans].reverse().map((s) => s.total);
            const mon = monitorByDomain.get(domain);
            return (
              <section key={domain} className="rounded-xl border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <ScoreRing score={latest.total} />
                    <div>
                      <h2 className="font-serif text-lg font-medium text-ink">{domain}</h2>
                      <p className="font-mono text-xs text-faint">
                        zuletzt {latest.createdAt.toLocaleDateString("de-AT")}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Sparkline scores={trend} />
                    <MonitorToggle
                      domain={domain}
                      active={mon?.active ?? false}
                      lastRunAt={mon?.lastRunAt ? mon.lastRunAt.toISOString() : null}
                    />
                    <RescanButton url={latest.url} />
                  </div>
                </div>

                <ul className="mt-5 divide-y divide-line border-t border-line">
                  {scans.map((s) => (
                    <li key={s.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-mono text-xs text-muted">
                        {s.createdAt.toLocaleDateString("de-AT")} · Score {s.total}
                      </span>
                      <Link href={`/report/${s.id}`} className="text-xs text-brand hover:underline">
                        Report öffnen →
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
