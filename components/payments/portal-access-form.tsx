"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { updateAccessNotesFromPortalAction } from "@/app/actions/portal";

export function PortalAccessForm({
  token,
  propertyId,
  initialNotes,
}: {
  token: string;
  propertyId: string;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    startTransition(async () => {
      await updateAccessNotesFromPortalAction({ token, propertyId, accessNotes: notes });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Key safe code 4821, please use side gate"
      />
      <Button size="sm" variant="outline" onClick={handleSave} disabled={isPending} className="self-end">
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}
        Save access notes
      </Button>
    </div>
  );
}
