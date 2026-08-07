import { LegalFooter } from "@/components/layout/legal-footer";
import { AdminEntryBrand } from "@/components/auth/admin-entry-brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <AdminEntryBrand />
          {children}
        </div>
      </div>
      <LegalFooter />
    </div>
  );
}
