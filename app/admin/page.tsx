import Link from "next/link";
import { requireAdmin } from "@/src/auth/admin";
import {
  getAdminStats,
  getRecentScansWithLead,
  getRecentLeads,
  getAccountsOverview,
} from "@/src/db/repo";
import { isCompEmail } from "@/src/billing/access";
import { effectivePlan, type Plan } from "@/src/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmt(d: Date): string {
  return d.toLocaleDateString("de-AT");
}

function planLabel(p: Plan): string {
  return p === "free" ? "Gratis" : p === "klein" ? "Klein" : "Groß";
}

export default async function AdminPage() {
  await requireAdmin();

  const [stats, recentScans, recentLeads, accountsOverview] = await Promise.all([
    getAdminStats(),
    getRecentScansWithLead(100),
    getRecentLeads(100),
    getAccountsOverview(),
  ]);

  const kpis = [
    { label: "Scans gesamt", value: stats.totalScans },
    { label: "Scans heute", value: stats.scansToday },
    { label: "Ø-Score", value: stats.avgScore },
    { label: "Leads", value: stats.totalLeads },
    { label: "Aktive Abos", value: stats.activeSubs },
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Admin</p>
      <h1 className="mt-2 font-serif text-3xl font-medium text-ink">Protokolle & Übersicht</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-4">
            <div className="font-mono text-2xl text-ink">{k.value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-faint">{k.label}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Scans (neueste {recentScans.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Datum</th>
              <th className="px-4 py-2 font-mono font-normal">Domain</th>
              <th className="px-4 py-2 font-mono font-normal">Score</th>
              <th className="px-4 py-2 font-mono font-normal">Lead</th>
              <th className="px-4 py-2 font-mono font-normal">Report</th>
            </tr>
          </thead>
          <tbody>
            {recentScans.map((s) => (
              <tr key={s.id} className="border-b border-line/50">
                <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(s.createdAt)}</td>
                <td className="px-4 py-2 text-ink">{s.domain}</td>
                <td className="px-4 py-2 font-mono text-muted">{s.total}</td>
                <td className="px-4 py-2 font-mono text-xs text-faint">{s.leadEmail ?? "–"}</td>
                <td className="px-4 py-2">
                  <Link href={`/report/${s.id}`} className="text-xs text-brand hover:underline">
                    öffnen →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Leads (neueste {recentLeads.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Datum</th>
              <th className="px-4 py-2 font-mono font-normal">E-Mail</th>
              <th className="px-4 py-2 font-mono font-normal">Domain</th>
            </tr>
          </thead>
          <tbody>
            {recentLeads.map((l, i) => (
              <tr key={i} className="border-b border-line/50">
                <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(l.createdAt)}</td>
                <td className="px-4 py-2 text-ink">{l.email}</td>
                <td className="px-4 py-2 text-muted">{l.domain}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-12 font-serif text-xl font-medium text-ink">Accounts ({accountsOverview.length})</h2>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-faint">
            <tr>
              <th className="px-4 py-2 font-mono font-normal">Erstellt</th>
              <th className="px-4 py-2 font-mono font-normal">E-Mail</th>
              <th className="px-4 py-2 font-mono font-normal">Plan</th>
              <th className="px-4 py-2 font-mono font-normal">Monitore</th>
            </tr>
          </thead>
          <tbody>
            {accountsOverview.map((a) => {
              const plan: Plan = isCompEmail(a.email)
                ? "gross"
                : effectivePlan(a.plan && a.status ? { plan: a.plan as Plan, status: a.status } : null);
              return (
                <tr key={a.id} className="border-b border-line/50">
                  <td className="px-4 py-2 font-mono text-xs text-muted">{fmt(a.createdAt)}</td>
                  <td className="px-4 py-2 text-ink">{a.email}</td>
                  <td className="px-4 py-2 font-mono text-xs text-brand">{planLabel(plan)}</td>
                  <td className="px-4 py-2 font-mono text-muted">{a.monitorCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
