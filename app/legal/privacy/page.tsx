import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — RoundFlow" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground">Last updated: 8 August 2026</p>

      <p>
        Heimdell Tech Ai Ltd (company number 16478408, registered office at Croft, Preston,
        PR1 9DJ, ICO registration ZC079121) is committed to protecting your privacy. This policy
        explains what personal data we collect through RoundFlow (the &quot;Service&quot;), why,
        and how it is handled under UK GDPR and the Data Protection Act 2018.
      </p>

      <h2 className="text-lg font-semibold">1. Two roles: controller and processor</h2>
      <p>
        When a business signs up to RoundFlow (an &quot;Account Holder&quot;), Heimdell Tech Ai
        Ltd is the <strong>data controller</strong> for the Account Holder&apos;s own account
        details (e.g. business owner/staff name, login email, phone number).
      </p>
      <p>
        Account Holders use RoundFlow to store and manage information about their own customers
        (&quot;End Clients&quot;) — names, addresses, contact details, service history, access
        notes, and payment status. For that End Client data, the <strong>Account Holder is the
        data controller</strong> and Heimdell Tech Ai Ltd acts only as a{" "}
        <strong>data processor</strong>, processing it solely on the Account Holder&apos;s
        instructions to provide the Service. If you are an End Client with a question about your
        own data, please contact the business that provides your window cleaning/gardening
        service directly in the first instance.
      </p>

      <h2 className="text-lg font-semibold">2. What we collect</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>Account details: name, email, phone, password (stored hashed), role.</li>
        <li>
          Customer and property records entered by Account Holders: names, addresses, postcodes,
          phone numbers, email addresses, access/hazard notes, and approximate map coordinates
          derived from the address for route planning.
        </li>
        <li>Service and job records: schedules, prices, job status, before/after photos, worker notes.</li>
        <li>
          Payment-related data: preferred payment method, and tokenised references to a Stripe
          customer/payment method or GoCardless mandate. We do not store full card numbers or
          bank account numbers — these are held directly by Stripe/GoCardless.
        </li>
        <li>Usage data: login times, and technical data such as IP address and browser type, for security and diagnostics.</li>
        <li>
          If you install RoundFlow&apos;s admin app and enable notifications, a push-notification
          token (an opaque identifier from your browser/device, not readable by us as personal
          content) so we can deliver that notification.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">3. How we use it</h2>
      <p>
        To provide the Service (scheduling, route mapping, payment collection, client self-service
        portal, notifications), to maintain security and prevent misuse, to provide support, and
        to meet legal obligations. We do not sell personal data, and we do not use Customer Data
        for our own marketing purposes.
      </p>

      <h2 className="text-lg font-semibold">4. Who we share it with</h2>
      <p>
        We use the following third-party processors to operate the Service, each of whom
        processes data only as needed to provide their part of it:
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>Stripe — card payment processing.</li>
        <li>GoCardless — Direct Debit payment processing.</li>
        <li>Twilio — SMS notifications.</li>
        <li>Resend — email notifications.</li>
        <li>Netlify — application hosting.</li>
        <li>Neon — database hosting (PostgreSQL, EU/UK region where available).</li>
        <li>OpenStreetMap / Nominatim — address geocoding for the route map (address text only, no other personal data is sent).</li>
      </ul>
      <p>We do not use any advertising or analytics trackers on the Service.</p>

      <h2 className="text-lg font-semibold">5. Retention</h2>
      <p>
        Account Holders control retention of their Customer Data and can delete customer records
        from within the Service, which removes the associated jobs, notes, and payment history.
        See section 6 below for what happens, and what is retained, when an account or an entire
        organisation is deleted.
      </p>

      <h2 className="text-lg font-semibold">6. Account deletion</h2>
      <p>
        You can request deletion of your RoundFlow account in two ways:
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <strong>From inside the app</strong> — Settings → Your account (to delete just your own
          login) or Settings → Danger zone (for an organisation administrator to delete the whole
          organisation).
        </li>
        <li>
          <strong>Without signing in</strong> — via our public{" "}
          <a href="/legal/delete-account" className="underline underline-offset-2">
            account deletion page
          </a>
          , which explains the process in full and verifies your identity by email before anything
          is actioned.
        </li>
      </ul>
      <p>
        We process deletion requests without undue delay, and always within one calendar month of
        verification.
      </p>

      <h3 className="text-base font-semibold">6.1 What is normally deleted</h3>
      <p>
        For an individual account: your name, email address, phone number, and password are
        permanently removed and your login is deactivated immediately. Where you were assigned to
        jobs within an organisation that keeps operating, those historical records are kept for the
        organisation&apos;s own operational purposes but show &quot;Former user&quot; in place of
        your name — no personal information about you remains attached to them.
      </p>
      <p>
        For a whole organisation: all of that organisation&apos;s data is deleted — staff accounts,
        customers, properties, jobs, photographs, notifications, routes, and any Stripe/GoCardless
        credentials connected to the organisation&apos;s own account.
      </p>
      <p>
        <strong>
          We do not retain a business&apos;s customer records, job photographs, addresses, or
          contact details merely because that business may have its own separate accounting or
          record-keeping obligations.
        </strong>{" "}
        It is the Account Holder&apos;s own responsibility to export anything they are legally
        required to keep before requesting deletion — our deletion flow warns you of this before
        you confirm.
      </p>

      <h3 className="text-base font-semibold">6.2 What may be retained, and why</h3>
      <p>Only two things are ever retained after a deletion request is processed:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <strong>Heimdell&apos;s own platform billing records</strong> — the fact that an
          organisation subscribed to RoundFlow, for how long, and a reference to the corresponding
          Stripe invoice/payment record (which Stripe itself separately retains). This never
          includes that organisation&apos;s own customers&apos; personal data. We keep this until{" "}
          <strong>six years after the end of Heimdell&apos;s financial year</strong> (Heimdell Tech
          Ai Ltd&apos;s financial year ends 31 May) in which the billing record falls, in line with
          UK accounting and tax record-keeping obligations (Companies Act 2006 / HMRC guidance).
          Records may exceptionally be kept longer where required by an open HMRC compliance check,
          a late-filed tax return, or another documented legal hold.
        </li>
        <li>
          <strong>A minimal deletion audit record</strong> — the fact that a request was made and
          processed, its dates, and a short summary of what was deleted. This exists purely to
          prove the request was handled correctly, and is deliberately designed to hold no more
          personal data than necessary.
        </li>
      </ul>
      <p>
        We may also retain a strictly limited, minimised, and anonymised record where genuinely
        necessary for security, fraud prevention, or to establish, exercise, or defend legal
        claims — for example, evidence of abuse of the Service. Where this applies we document the
        specific lawful basis and a retention expiry at the time.
      </p>

      <h3 className="text-base font-semibold">6.3 Third-party processors</h3>
      <p>
        Where applicable, we also action deletion requests with the processors listed in section 4
        (in particular Stripe, GoCardless, Twilio, and Resend) in line with their own data-deletion
        processes for data they hold on our behalf.
      </p>

      <h3 className="text-base font-semibold">6.4 Abuse protection on the public deletion-request page</h3>
      <p>
        To stop the public, unauthenticated{" "}
        <a href="/legal/delete-account" className="underline underline-offset-2">
          account deletion page
        </a>{" "}
        being abused (for example, to flood the system with fake requests or guess verification
        links), we keep short-lived request counters keyed to your IP address and the email address
        you submit. Your IP address is never stored as-is — it is passed through a keyed
        cryptographic hash (HMAC-SHA256) before being saved, so the stored value cannot be reversed
        back into your IP address. These counters hold no other personal data, are not linked to
        your account, and each one automatically expires — within an hour for IP-based counters, and
        within 24 hours for email-based counters. This is retained solely for security/abuse
        prevention under our legitimate interest in keeping the Service available and trustworthy.
      </p>

      <h2 className="text-lg font-semibold">7. Your rights</h2>
      <p>Under UK GDPR you have the right to:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>access the personal data we (or, for End Client data, the relevant Account Holder) hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have data erased in certain circumstances (see section 6 above);</li>
        <li>object to or restrict certain processing;</li>
        <li>receive your data in a portable format;</li>
        <li>complain to the Information Commissioner&apos;s Office (ico.org.uk) if you believe your data has been mishandled.</li>
      </ul>
      <p>
        To exercise these rights over data we control directly, email{" "}
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
          admin@heimdell-tech-ai.co.uk
        </a>
        .
      </p>

      <h2 className="text-lg font-semibold">8. Data Protection Registration</h2>
      <p>
        Heimdell Tech AI Ltd is registered with the UK Information Commissioner&apos;s Office (ICO)
        under registration number ZC079121.
      </p>

      <h2 className="text-lg font-semibold">9. Security</h2>
      <p>
        We use industry-standard measures including encrypted connections (HTTPS), hashed
        passwords, and access controls scoped per Organisation, so one Account Holder cannot see
        another&apos;s data.
      </p>

      <h2 className="text-lg font-semibold">10. Children</h2>
      <p>The Service is intended for business use and is not directed at children.</p>

      <h2 className="text-lg font-semibold">11. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be reflected by the &quot;Last updated&quot; date above.</p>

      <h2 className="text-lg font-semibold">12. Contact</h2>
      <p>
        Heimdell Tech Ai Ltd, Croft, Preston, PR1 9DJ —{" "}
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
          admin@heimdell-tech-ai.co.uk
        </a>
        .
      </p>
    </>
  );
}
