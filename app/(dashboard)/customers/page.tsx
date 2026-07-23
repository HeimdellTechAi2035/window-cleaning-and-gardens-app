import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { initials } from "@/lib/utils";
import { MapPin, Phone } from "lucide-react";

export default async function CustomersPage() {
  const session = await auth();

  const customers = await prisma.customer.findMany({
    where: { organizationId: session!.user.organizationId },
    include: { properties: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{customers.length} customers</p>
        <CreateCustomerDialog />
      </div>

      {customers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No customers yet. Add your first customer to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {customers.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {initials(customer.firstName, customer.lastName)}
                    </div>
                    <div>
                      <p className="font-semibold">
                        {customer.firstName} {customer.lastName}
                      </p>
                      {customer.phone && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" /> {customer.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  {customer.properties[0] && (
                    <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      {customer.properties[0].addressLine1}, {customer.properties[0].city}
                    </p>
                  )}

                  <Badge variant="outline" className="w-fit">
                    {customer.preferredPaymentMethod.replace("_", " ")}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
