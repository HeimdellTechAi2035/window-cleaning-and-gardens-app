"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 flex-1 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
