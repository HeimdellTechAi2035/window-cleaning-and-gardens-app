"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2 } from "lucide-react";
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
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateCustomerAction } from "@/app/actions/customers";
import type { PaymentMethod } from "@prisma/client";

const paymentMethods = [
  { value: "DIRECT_DEBIT", label: "Direct Debit" },
  { value: "CARD", label: "Card (Stripe)" },
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
] as const;

export interface EditCustomerData {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredPaymentMethod: PaymentMethod;
  property?: {
    id: string;
    addressLine1: string;
    city: string;
    postcode: string;
  };
}

export function EditCustomerDialog({ customer }: { customer: EditCustomerData }) {
  const [open, setOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentMethods)[number]["value"]>(
    customer.preferredPaymentMethod
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // onSubmit + preventDefault instead of <form action={fn}> — React resets
  // every uncontrolled field the instant a form action is invoked whether
  // it succeeds or not, which would wipe the admin's edits on error.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("customerId", customer.id);
    formData.set("preferredPaymentMethod", paymentMethod);
    if (customer.property) {
      formData.set("propertyId", customer.property.id);
    }

    setError(null);
    startTransition(async () => {
      const result = await updateCustomerAction(formData);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOpen(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Update contact details, address, and payment method.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-firstName">First name</Label>
              <Input id="edit-firstName" name="firstName" defaultValue={customer.firstName} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lastName">Last name</Label>
              <Input id="edit-lastName" name="lastName" defaultValue={customer.lastName} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-email">Email</Label>
              <Input id="edit-email" name="email" type="email" defaultValue={customer.email ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input id="edit-phone" name="phone" type="tel" defaultValue={customer.phone ?? ""} />
            </div>
          </div>

          {customer.property && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-addressLine1">Property address</Label>
                <Input
                  id="edit-addressLine1"
                  name="addressLine1"
                  defaultValue={customer.property.addressLine1}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-city">City</Label>
                  <Input id="edit-city" name="city" defaultValue={customer.property.city} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-postcode">Postcode</Label>
                  <Input
                    id="edit-postcode"
                    name="postcode"
                    defaultValue={customer.property.postcode}
                    required
                  />
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Preferred payment method</Label>
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm transition-colors",
                    paymentMethod === m.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
