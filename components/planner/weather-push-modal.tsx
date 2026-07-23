"use client";

import { useState, useTransition } from "react";
import { CloudRain, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { pushRoundAction } from "@/app/actions/jobs";

export function WeatherPushModal({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function handlePush(hours: 24 | 48) {
    startTransition(async () => {
      const result = await pushRoundAction({ date, hours });
      setLastResult(`Pushed ${result.count} job${result.count === 1 ? "" : "s"} by ${hours}h`);
      setTimeout(() => setOpen(false), 900);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CloudRain className="h-4 w-4" />
          Weather delay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudRain className="h-5 w-5 text-primary" />
            Push round for weather
          </DialogTitle>
          <DialogDescription>
            Bulk-move every incomplete job scheduled today. This does not affect each
            property&apos;s underlying repeat interval — only today&apos;s visits move.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" disabled={isPending} onClick={() => handlePush(24)}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Push 24 hours
          </Button>
          <Button variant="secondary" disabled={isPending} onClick={() => handlePush(48)}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Push 48 hours
          </Button>
        </div>

        {lastResult && <p className="mt-3 text-center text-sm text-success">{lastResult}</p>}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
