"use client";

import { useState } from "react";

export default function ManageBillingButton({ className }: { className?: string }) {
  const [busy, setBusy] = useState(false);

  async function manage() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button onClick={manage} disabled={busy} className={className}>
      {busy ? "Weiterleiten…" : "Abo verwalten"}
    </button>
  );
}
