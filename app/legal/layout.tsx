import Link from "next/link";
import { LegalFooter } from "@/components/layout/legal-footer";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-512.png" alt="" className="h-9 w-9" />
            <span className="font-semibold">RoundFlow</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground sm:p-8">
          {children}
        </article>
      </main>

      <LegalFooter />
    </div>
  );
}
