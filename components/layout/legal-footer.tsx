import Link from "next/link";

export function LegalFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className={`border-t border-border bg-muted/20 px-4 py-6 text-center text-xs text-muted-foreground ${className ?? ""}`}>
      <p>
        &copy; {year} Heimdell Tech Ai Ltd. Registered in England &amp; Wales. Company No.{" "}
        <a
          href="https://find-and-update.company-information.service.gov.uk/company/16478408"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          16478408
        </a>
        .
      </p>
      <p>
        Croft, Preston, PR1 9DJ. ICO Reg:{" "}
        <a
          href="https://ico.org.uk/ESDWebPages/Entry/ZC079121"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          ZC079121
        </a>
        .
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
          Terms of Service
        </Link>
        <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-foreground">
          Cookie Policy
        </Link>
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2 hover:text-foreground">
          admin@heimdell-tech-ai.co.uk
        </a>
      </p>
    </footer>
  );
}
