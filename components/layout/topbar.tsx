"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function Topbar({
  title,
  userName,
  userInitials,
}: {
  title: string;
  userName: string;
  userInitials: string;
}) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md lg:px-8">
      <h1 className="text-lg font-semibold">{title}</h1>

      <div className="flex items-center gap-3">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-accent">
              {theme === "dark" ? (
                <Moon className="h-4 w-4" />
              ) : theme === "light" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Monitor className="h-4 w-4" />
              )}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              className="z-50 min-w-36 rounded-lg border border-border bg-card p-1 shadow-lg animate-fade-in"
            >
              {(["light", "dark", "system"] as const).map((t) => (
                <DropdownMenu.Item
                  key={t}
                  onSelect={() => setTheme(t)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm capitalize outline-none hover:bg-accent",
                    theme === t && "text-primary"
                  )}
                >
                  {t}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary" title={userName}>
          {userInitials}
        </div>
      </div>
    </header>
  );
}
