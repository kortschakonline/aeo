import Link from "next/link";

export default function SiteHeader() {
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
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-faint">
          AEO Score Check
        </span>
      </div>
    </header>
  );
}
