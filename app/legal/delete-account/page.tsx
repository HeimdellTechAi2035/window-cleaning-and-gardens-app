import type { Metadata } from "next";
import { DeleteAccountForm } from "@/components/legal/delete-account-form";

export const metadata: Metadata = { title: "Delete Your Account — RoundFlow" };

export default function DeleteAccountPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Delete Your Account</h1>
      <p className="text-xs text-muted-foreground">
        RoundFlow is provided by Heimdell Tech Ai Ltd. This page works without signing in.
      </p>

      <p>
        You can request deletion of your RoundFlow account in two ways: from inside the app (Settings
        → Your account, or Settings → Danger zone for a whole organisation), or using the form on this
        page if you can&apos;t or would rather not sign in.
      </p>

      <h2 className="text-lg font-semibold">What you can request</h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <strong>Deletion of just your own account</strong> — removes your personal login (name,
          email, phone). Your organisation and its other staff keep working normally.
        </li>
        <li>
          <strong>Deletion of a whole organisation</strong> — only an organisation administrator can
          request this. It removes the business account and all of its operational data: staff
          accounts, customers, properties, jobs, photos, notifications, routes, and connected payment
          settings.
        </li>
      </ul>

      <h2 className="text-lg font-semibold">Verifying it&apos;s really you</h2>
      <p>
        Because this form doesn&apos;t require signing in, we verify identity by email before acting on
        any request: we send a confirmation link to the account email address you enter, which expires
        after 48 hours and can only be used once. We never ask for your password on this page. If email
        verification isn&apos;t available for your account, our support team will contact you directly
        to confirm your identity before processing anything.
      </p>
      <p>
        We don&apos;t confirm or deny whether a particular email address has a RoundFlow account —
        submitting this form always shows the same message, whether or not a match was found.
      </p>

      <h2 className="text-lg font-semibold">How long it takes</h2>
      <p>
        Once verified, we process deletion requests without undue delay, and always within one calendar
        month.
      </p>

      <h2 className="text-lg font-semibold">What&apos;s normally deleted</h2>
      <p>
        Names, email addresses, phone numbers, passwords, customer and property records, job records
        and photographs, notifications, routes, and connected Stripe/GoCardless credentials are
        permanently deleted or, for an individual account inside an organisation that keeps running,
        anonymised.
      </p>

      <h2 className="text-lg font-semibold">What may be retained, and why</h2>
      <p>
        We only ever retain the minimum required by law — never tenant customer personal data. Two
        specific things may be kept after a deletion request is processed:
      </p>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        <li>
          <strong>Heimdell&apos;s own accounting records</strong> of a business&apos;s RoundFlow
          subscription (invoice references, payment dates, amounts) — kept for six years, in line with
          UK accounting and tax record-keeping obligations. This never includes any of that
          business&apos;s own customers&apos; personal data.
        </li>
        <li>
          <strong>A minimal audit record</strong> proving a deletion request was made and handled — the
          request type, dates, and a short summary of what was deleted, kept so we can demonstrate
          compliance without holding on to unnecessary personal data.
        </li>
      </ul>
      <p>
        We do not retain a business&apos;s customer records, job photographs, addresses, or contact
        details on the basis that the business itself might have its own separate accounting
        obligations — that business is responsible for exporting anything it needs to keep before
        requesting deletion.
      </p>

      <h2 className="text-lg font-semibold">Third parties</h2>
      <p>
        Where applicable, we also action deletion with the third-party processors used to provide the
        Service (Stripe, GoCardless, Twilio, Resend) in line with their own data-deletion processes.
      </p>

      <h2 className="text-lg font-semibold">Request deletion</h2>
      <DeleteAccountForm />

      <h2 className="text-lg font-semibold">Contact</h2>
      <p>
        Questions about this process can be sent to{" "}
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
          admin@heimdell-tech-ai.co.uk
        </a>
        . You can also complain to the Information Commissioner&apos;s Office (ico.org.uk) if you
        believe your data has been mishandled.
      </p>
    </>
  );
}
