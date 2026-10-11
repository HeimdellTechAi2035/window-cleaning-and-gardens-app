import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { GARDEN_PLANS, GARDEN_SUBSCRIPTION_STATUS, type GardenSubscriptionSummary } from "@/lib/garden-plans";

export function GardenSubscriptionSummaryPanel({ subscription, showIncludedWork = false }: {
  subscription: GardenSubscriptionSummary;
  showIncludedWork?: boolean;
}) {
  const plan = GARDEN_PLANS[subscription.plan];
  return (
    <section aria-label={`${plan.name} subscription`} className="rounded-xl border border-primary/25 bg-primary/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Garden subscription</p>
          <h3 className="mt-1 text-base font-semibold">{plan.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{plan.visitFrequency}</p>
        </div>
        <p className="text-lg font-semibold">{formatCurrency(subscription.priceMonthlyPence / 100)}<span className="text-sm font-normal text-muted-foreground">/month</span></p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant={subscription.status === "ACTIVE" ? "success" : "secondary"}>{GARDEN_SUBSCRIPTION_STATUS[subscription.status]}</Badge>
        {subscription.tpvVerifiedAt && <Badge variant="success">TPV verified</Badge>}
        {subscription.preferredDay && <Badge variant="outline">Preferred day: {subscription.preferredDay}</Badge>}
      </div>
      {showIncludedWork && (
        <div className="mt-3 border-t border-primary/15 pt-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Included in your package</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {plan.includedWork.map(item => <li key={item}>{item}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
