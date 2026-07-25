import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy — RoundFlow" };

export default function PrivacyPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-xs text-muted-foreground">Last updated: 25 July 2026</p>

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
        We retain account and billing records for as long as needed to meet our legal and tax
        obligations after an account closes.
      </p>

      <h2 className="text-lg font-semibold">6. Your rights</h2>
      <p>Under UK GDPR you have the right to:</p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>access the personal data we (or, for End Client data, the relevant Account Holder) hold about you;</li>
        <li>have inaccurate data corrected;</li>
        <li>have data erased in certain circumstances;</li>
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

      <h2 className="text-lg font-semibold">7. Security</h2>
      <p>
        We use industry-standard measures including encrypted connections (HTTPS), hashed
        passwords, and access controls scoped per Organisation, so one Account Holder cannot see
        another&apos;s data.
      </p>

      <h2 className="text-lg font-semibold">8. Children</h2>
      <p>The Service is intended for business use and is not directed at children.</p>

      <h2 className="text-lg font-semibold">9. Changes to this policy</h2>
      <p>We may update this policy from time to time; material changes will be reflected by the &quot;Last updated&quot; date above.</p>

      <h2 className="text-lg font-semibold">10. Contact</h2>
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
