import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateRoundDialog } from "@/components/rounds/create-round-dialog";
import { Repeat } from "lucide-react";

export default async function RoundsPage() {
  const session = await auth();

  const rounds = await prisma.round.findMany({
    where: { organizationId: session!.user.organizationId },
    include: {
      _count: { select: { jobs: true } },
      jobs: {
        where: { status: "SCHEDULED" },
        select: { priceCharged: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Manage recurring interval-based rounds — 4/8/12-weekly cycles per property.
        </p>
        <CreateRoundDialog />
      </div>

      {rounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
          No rounds yet. Create your first round to start scheduling jobs.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rounds.map((round) => {
            const scheduledValue = round.jobs.reduce((sum, j) => sum + Number(j.priceCharged), 0);
            return (
              <Card key={round.id} className="overflow-hidden">
                <div className="h-1.5" style={{ backgroundColor: round.colorCode }} />
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${round.colorCode}22`, color: round.colorCode }}
                      >
                        <Repeat className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold">{round.name}</p>
                        {round.description && (
                          <p className="text-xs text-muted-foreground">{round.description}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={round.isActive ? "success" : "secondary"}>
                      {round.isActive ? "Active" : "Paused"}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">{round._count.jobs} total jobs</span>
                    <span className="font-medium">£{scheduledValue.toFixed(2)} scheduled</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
