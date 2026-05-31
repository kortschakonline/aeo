"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AccountMenu({ email }: { email: string }) {
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

  return (
    <div className="flex items-center gap-4 text-xs">
      <span className="font-mono text-faint">{email}</span>
      <button onClick={logout} disabled={busy} className="text-muted hover:text-ink disabled:opacity-60">
        Abmelden
      </button>
      <button onClick={deleteAccount} disabled={busy} className="text-muted hover:text-brand disabled:opacity-60">
        Account löschen
      </button>
    </div>
  );
}
