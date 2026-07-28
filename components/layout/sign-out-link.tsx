"use client";

import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

export function SignOutLink({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className={cn("underline underline-offset-2", className)}
    >
      Sign out
    </button>
  );
}
