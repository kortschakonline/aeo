"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RescanButton({ url }: { url: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function rescan() {
    setLoading(true);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (res.ok && data.id) router.push(`/report/${data.id}`);
      else router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={rescan}
      disabled={loading}
      className="rounded-md border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-muted transition-colors hover:text-ink disabled:opacity-60"
    >
      {loading ? "Scannt…" : "Erneut scannen"}
    </button>
  );
}
