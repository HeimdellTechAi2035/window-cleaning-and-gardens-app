import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Google Play Review Information — RoundFlow" };

export default function PlayReviewPage() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/20">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/icons/icon-512.png" alt="" width={36} height={36} className="h-9 w-9" priority />
            <span className="font-semibold">RoundFlow</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 text-sm leading-relaxed text-foreground sm:p-8">
          <h1 className="text-2xl font-semibold">Google Play Review Information</h1>

          <p>Thank you for reviewing RoundFlow.</p>

          <p>Use the credentials supplied in the Google Play Console.</p>

          <p>The supplied organisation contains fictional:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>Customers</li>
            <li>Properties</li>
            <li>Jobs</li>
            <li>Workers</li>
            <li>Routes</li>
            <li>Invoices</li>
            <li>Financial records</li>
          </ul>

          <p className="font-medium">No live customer information is contained within this account.</p>
          <p className="font-medium">No payment is required.</p>
        </article>
      </main>
    </div>
  );
}
