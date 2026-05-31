"use client";

import { useState } from "react";

export default function LoginForm({ error }: { error?: string }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch("/api/auth/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="animate-fade-up w-full max-w-md text-center">
        <h1 className="font-serif text-2xl font-medium text-ink">Schau in dein Postfach</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Wenn ein Zugang zu <span className="text-ink">{email}</span> existiert, haben wir dir einen
          Login-Link geschickt. Er ist 15 Minuten gültig.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="animate-fade-up w-full max-w-md text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Anmelden</p>
      <h1 className="mt-3 font-serif text-3xl font-medium text-ink">Dein AEO-Dashboard</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        Gib deine E-Mail ein — wir schicken dir einen Login-Link. Kein Passwort nötig.
      </p>
      {error && (
        <p className="mt-4 text-sm text-brand">
          Der Link war ungültig oder abgelaufen. Fordere einen neuen an.
        </p>
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="dein@unternehmen.at"
        className="mt-6 w-full rounded-lg border border-line bg-surface px-4 py-3 text-sm text-ink outline-none focus:border-brand"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-4 w-full rounded-lg bg-brand px-6 py-3 font-sans text-sm font-semibold text-ink transition-colors hover:bg-brand-alt disabled:opacity-60"
      >
        {loading ? "Wird gesendet…" : "Login-Link schicken"}
      </button>
    </form>
  );
}
