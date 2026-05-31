"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MonitorToggle({
  domain,
  active,
  lastRunAt,
}: {
  domain: string;
  active: boolean;
  lastRunAt: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function toggle() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/monitoring/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, active: !active }),
      });
      if (res.status === 409) {
        const d = await res.json();
        setMsg(d.error ?? "Abo erforderlich");
        return;
      }
      if (!res.ok) {
        setMsg("Fehler");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={toggle}
        disabled={busy}
        className={`rounded-md border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors disabled:opacity-60 ${
          active ? "border-brand text-brand" : "border-line text-muted hover:text-ink"
        }`}
      >
        {active ? "Monitoring: An" : "Monitoring: Aus"}
      </button>
      <span className="font-mono text-[10px] text-faint">
        {active
          ? lastRunAt
            ? `wöchentlich · zuletzt ${new Date(lastRunAt).toLocaleDateString("de-AT")}`
            : "wöchentlich · läuft bald"
          : ""}
      </span>
      {msg &&
        (msg === "Abo erforderlich" ? (
          <a href="/pricing" className="font-mono text-[10px] text-brand underline">
            Abo erforderlich – upgraden
          </a>
        ) : (
          <span className="font-mono text-[10px] text-brand">{msg}</span>
        ))}
    </div>
  );
}
