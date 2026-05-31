import Link from "next/link";

interface SiteHeaderProps {
  isLoggedIn?: boolean;
}

export default function SiteHeader({ isLoggedIn }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
        <Link
          href="/"
          aria-label="Kortschak – zur Startseite"
          className="flex items-center transition-opacity hover:opacity-80"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/Logo_Kortschak_mono_weiss.svg"
            alt="Kortschak Schriften"
            className="h-7 w-auto sm:h-8"
          />
        </Link>
        <div className="flex items-center gap-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
            AEO Score Check
          </span>
          <Link
            href="/pricing"
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            Preise
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:text-ink"
          >
            {isLoggedIn ? "Dashboard" : "Anmelden"}
          </Link>
        </div>
      </div>
    </header>
  );
}
