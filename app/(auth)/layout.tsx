import { Droplets } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Droplets className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold">RoundFlow</span>
        </div>
        {children}
      </div>
    </div>
  );
}
