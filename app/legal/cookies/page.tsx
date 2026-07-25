import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cookie Policy — RoundFlow" };

export default function CookiesPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Cookie Policy</h1>
      <p className="text-xs text-muted-foreground">Last updated: 25 July 2026</p>

      <p>
        This policy explains how Heimdell Tech Ai Ltd (company number 16478408) uses cookies on
        RoundFlow (the &quot;Service&quot;).
      </p>

      <h2 className="text-lg font-semibold">1. What we use cookies for</h2>
      <p>
        RoundFlow only uses <strong>strictly necessary</strong> cookies — the small number needed
        to keep you securely signed in and to protect the Service against cross-site request
        forgery. We do not use any advertising, tracking, or analytics cookies, and no cookies
        are set until you sign in or attempt to.
      </p>

      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-3 font-semibold">Purpose</th>
            <th className="py-2 pr-3 font-semibold">Type</th>
            <th className="py-2 font-semibold">Expiry</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="py-2 pr-3">Keeps you signed in to your account</td>
            <td className="py-2 pr-3">Strictly necessary</td>
            <td className="py-2">Session / up to 30 days if &quot;stay signed in&quot;</td>
          </tr>
          <tr className="border-b border-border">
            <td className="py-2 pr-3">Protects sign-in forms from cross-site request forgery</td>
            <td className="py-2 pr-3">Strictly necessary</td>
            <td className="py-2">Session</td>
          </tr>
        </tbody>
      </table>

      <p>
        Because these cookies are strictly necessary for the Service to function (you cannot be
        securely signed in without them), UK PECR rules do not require us to ask for consent to
        set them — but we tell you about them here for transparency.
      </p>

      <h2 className="text-lg font-semibold">2. Installed app / offline use</h2>
      <p>
        If you install RoundFlow as an app on your device, your browser also stores the app&apos;s
        static files (icons, styling, code) locally so it loads faster and can show a shell while
        offline. This is local browser storage, not a tracking cookie, and holds no personal data
        — every page load still fetches your live data from our servers.
      </p>

      <h2 className="text-lg font-semibold">3. Controlling cookies</h2>
      <p>
        Most browsers let you view, delete, or block cookies through their settings. Blocking the
        cookies described above will prevent you from staying signed in to RoundFlow.
      </p>

      <h2 className="text-lg font-semibold">4. Contact</h2>
      <p>
        Questions about this policy can be sent to{" "}
        <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
          admin@heimdell-tech-ai.co.uk
        </a>
        .
      </p>
    </>
  );
}
