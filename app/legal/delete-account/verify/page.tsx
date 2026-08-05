import type { Metadata } from "next";
import { verifyPublicDeletionRequestAction } from "@/app/actions/public-deletion";

export const metadata: Metadata = { title: "Confirm Account Deletion — RoundFlow" };

// force-dynamic: this reads a one-time-use token and must never be cached
// or statically prerendered.
export const dynamic = "force-dynamic";

export default async function VerifyDeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token
    ? await verifyPublicDeletionRequestAction(token)
    : { error: "This link is missing its verification token." };

  return (
    <>
      <h1 className="text-2xl font-semibold">Confirm Account Deletion</h1>

      {"error" in result ? (
        <div className="not-prose rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {result.error}
        </div>
      ) : (
        <div className="not-prose rounded-lg border border-border bg-muted/40 p-4 text-sm">
          <p className="font-medium">Your deletion request has been verified.</p>
          <p className="mt-2 text-muted-foreground">
            A Heimdell administrator will review and process it within one calendar month. You don&apos;t
            need to do anything else — you&apos;ll be able to see the outcome by contacting{" "}
            <a href="mailto:admin@heimdell-tech-ai.co.uk" className="underline underline-offset-2">
              admin@heimdell-tech-ai.co.uk
            </a>{" "}
            at any time.
          </p>
        </div>
      )}
    </>
  );
}
