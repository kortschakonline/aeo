import { notFound, redirect } from "next/navigation";
import { getScan } from "@/src/db/repo";
import { getSession } from "@/src/auth/session";
import { isAdminEmail } from "@/src/billing/access";
import ReportView from "@/components/ReportView";
import type { ScanResult } from "@/components/types";

export const runtime = "nodejs";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scan = await getScan(Number(id));
  if (!scan) notFound();

  const session = await getSession();
  const owned =
    !!session &&
    ((scan.accountId != null && scan.accountId === session.accountId) || isAdminEmail(session.email));
  if (!owned) redirect("/login");

  const result: ScanResult = {
    url: scan.url,
    domain: scan.domain,
    total: scan.total,
    categories: scan.categories as ScanResult["categories"],
    checks: scan.checks as ScanResult["checks"],
  };

  return (
    <main className="flex flex-1 flex-col">
      <ReportView result={result} scanId={scan.id} initiallyUnlocked />
    </main>
  );
}
