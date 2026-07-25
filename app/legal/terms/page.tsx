import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service — RoundFlow" };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="text-xs text-muted-foreground">Last updated: 25 July 2026</p>

      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of RoundFlow (the
        &quot;Service&quot;), provided by Heimdell Tech Ai Ltd, a company registered in England
        &amp; Wales (company number 16478408), registered office at Croft, Preston, PR1 9DJ
        (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By creating an account or using the
        Service, you agree to be bound by these Terms. If you do not agree, do not use the
        Service.
      </p>

      <h2 className="text-lg font-semibold">1. The Service</h2>
      <p>
        RoundFlow is a round-scheduling, route-planning, and payment-management platform for
        window cleaning, gardening, and similar field-service businesses. It is provided on a
        software-as-a-service basis to businesses (&quot;Account Holders&quot;), who in turn use
        it to manage their own customers (&quot;End Clients&quot;).
      </p>

      <h2 className="text-lg font-semibold">2. Accounts</h2>
      <p>
        You must provide accurate information when registering and keep your login credentials
        confidential. You are responsible for all activity that occurs under your account.
        Accounts are organised by business (&quot;Organisation&quot;); an Organisation&apos;s
        administrator controls which users can access it and what they can do.
      </p>

      <h2 className="text-lg font-semibold">3. Your data and content</h2>
      <p>
        You retain ownership of the data you input into the Service, including your End
        Clients&apos; details, job records, notes, and photographs (&quot;Customer Data&quot;).
        You are responsible for having a lawful basis to collect and process Customer Data,
        including your End Clients&apos; personal data, and for the accuracy of what you enter.
        See our{" "}
        <a href="/legal/privacy" className="underline underline-offset-2">
          Privacy Policy
        </a>{" "}
        for how we handle personal data as a processor on your behalf.
      </p>

      <h2 className="text-lg font-semibold">4. Payments</h2>
      <p>
        Where you use the Service to take payments from End Clients, card and Direct Debit
        payments are processed by third-party payment providers (currently Stripe and
        GoCardless). We do not store full card or bank account numbers. You are responsible for
        your own relationship and terms with your payment provider, and for complying with
        applicable payment services and card network rules.
      </p>

      <h2 className="text-lg font-semibold">5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>use the Service for any unlawful purpose or in breach of any third party&apos;s rights;</li>
        <li>attempt to gain unauthorised access to another Organisation&apos;s data or accounts;</li>
        <li>reverse engineer, resell, or sublicense the Service without our written consent;</li>
        <li>interfere with or disrupt the integrity or performance of the Service.</li>
      </ul>

      <h2 className="text-lg font-semibold">6. Availability and changes</h2>
      <p>
        We aim to keep the Service available and reliable but do not guarantee uninterrupted or
        error-free operation. We may update, modify, or discontinue features of the Service from
        time to time, and will use reasonable efforts to give notice of material changes.
      </p>

      <h2 className="text-lg font-semibold">7. Liability</h2>
      <p>
        To the fullest extent permitted by law, the Service is provided &quot;as is&quot;
        without warranties of any kind. We are not liable for indirect or consequential losses,
        loss of profits, or loss of data arising from your use of the Service. Nothing in these
        Terms excludes or limits liability for death or personal injury caused by negligence,
        fraud, or any other liability that cannot be excluded by law.
      </p>

      <h2 className="text-lg font-semibold">8. Termination</h2>
      <p>
        You may stop using the Service and close your account at any time. We may suspend or
        terminate access if these Terms are breached, or on reasonable notice for any other
        reason. On termination, we will handle your data in line with our{" "}
        <a href="/legal/privacy" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>

      <h2 className="text-lg font-semibold">9. Governing law</h2>
      <p>
        These Terms are governed by the laws of England &amp; Wales, and the courts of England
        &amp; Wales have exclusive jurisdiction over any dispute arising from them.
      </p>

      <h2 className="text-lg font-semibold">10. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
          admin@heimdell-tech-ai.co.uk
        </a>
        .
      </p>
    </>
  );
}
