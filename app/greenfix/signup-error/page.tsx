export default async function SignupErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-lg p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-muted-foreground mb-6">
          We couldn&apos;t complete your subscription signup. Please try again or call us on{" "}
          <a href="tel:07447804597" className="font-medium text-primary">
            07447 804597
          </a>
          .
        </p>
        {reason && (
          <p className="text-xs text-muted-foreground mb-6">Error reference: {reason}</p>
        )}
        <a
          href="https://greenfixexterior-care.co.uk/garden-maintenance-subscription"
          className="inline-block bg-primary text-primary-foreground rounded-lg px-6 py-3 font-medium hover:bg-primary/90 transition-colors"
        >
          Try Again
        </a>
      </div>
    </div>
  );
}
