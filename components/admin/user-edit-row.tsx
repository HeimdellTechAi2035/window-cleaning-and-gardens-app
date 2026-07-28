"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Loader2, Check } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { updateUserAsAdminAction } from "@/app/actions/super-admin";
import { ResetPasswordButton } from "./reset-password-button";

export interface AdminUserData {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  role: "ADMIN" | "OPERATIVE";
  isActive: boolean;
  isPlatformSuperAdmin: boolean;
}

export function UserEditRow({ user }: { user: AdminUserData }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("userId", user.id);
    setError(null);
    startTransition(async () => {
      const result = await updateUserAsAdminAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    });
  }

  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3"
      >
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left sm:min-w-[10rem]">
          <span className="truncate text-sm font-medium">{user.name ?? user.email}</span>
          <span className="max-w-full truncate text-xs text-muted-foreground">{user.email}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!user.isActive && (
            <Badge variant="destructive" className="text-[10px]">
              Inactive
            </Badge>
          )}
          {user.isPlatformSuperAdmin && (
            <Badge variant="destructive" className="text-[10px]">
              Super-admin
            </Badge>
          )}
          <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`name-${user.id}`}>Name</Label>
              <Input id={`name-${user.id}`} name="name" defaultValue={user.name ?? ""} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`email-${user.id}`}>Email</Label>
              <Input id={`email-${user.id}`} name="email" type="email" defaultValue={user.email} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`phone-${user.id}`}>Phone</Label>
              <Input id={`phone-${user.id}`} name="phone" defaultValue={user.phone ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`role-${user.id}`}>Role</Label>
              <select
                id={`role-${user.id}`}
                name="role"
                defaultValue={user.role}
                className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
              >
                <option value="OPERATIVE">Operative</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} className="h-4 w-4" />
            Active (unchecked blocks them from signing in)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPlatformSuperAdmin"
              defaultChecked={user.isPlatformSuperAdmin}
              className="h-4 w-4"
            />
            Platform super-admin (sees every organization, not just this one)
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saved ? (
                <Check className="h-3.5 w-3.5" />
              ) : null}
              {saved ? "Saved" : "Save"}
            </Button>
            <ResetPasswordButton userId={user.id} userName={user.name ?? user.email} />
          </div>
        </form>
      )}
    </div>
  );
}
