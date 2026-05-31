"use client";

import { useState } from "react";

export default function UpgradeButton({
  plan,
  label,
  className,
}: {
  plan: "klein" | "gross";
  label: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function upgrade() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button onClick={upgrade} disabled={busy} className={className}>
      {busy ? "Weiterleiten…" : label}
    </button>
  );
}
