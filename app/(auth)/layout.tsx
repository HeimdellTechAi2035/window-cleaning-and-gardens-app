import { LegalFooter } from "@/components/layout/legal-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-512.png" alt="" className="h-10 w-10" />
            <span className="text-lg font-semibold">RoundFlow</span>
          </div>
          {children}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
