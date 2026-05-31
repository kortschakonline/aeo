"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ManageBillingButton from "@/components/ManageBillingButton";

export default function AccountMenu({
  email,
  plan,
  hasSubscription,
}: {
  email: string;
  plan: "free" | "klein" | "gross";
  hasSubscription: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  async function deleteAccount() {
    if (!confirm("Account und alle persönlichen Daten endgültig löschen? Deine Scan-Daten werden anonymisiert.")) return;
    setBusy(true);
    await fetch("/api/account/delete", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const planLabel = plan === "free" ? "Gratis" : plan === "klein" ? "Klein" : "Groß";

  return (
    <div className="flex flex-wrap items-center gap-4 text-xs">
      <span className="font-mono text-faint">{email}</span>
      <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-brand">
        {planLabel}
      </span>
      {hasSubscription ? (
        <ManageBillingButton className="text-muted hover:text-ink disabled:opacity-60" />
      ) : (
        <Link href="/pricing" className="text-muted hover:text-ink">
          Upgraden
        </Link>
      )}
      <button onClick={logout} disabled={busy} className="text-muted hover:text-ink disabled:opacity-60">
        Abmelden
      </button>
      <button onClick={deleteAccount} disabled={busy} className="text-muted hover:text-brand disabled:opacity-60">
        Account löschen
      </button>
    </div>
  );
}
