import { describe, it, expect, vi } from "vitest";

// Deliberately does NOT mock @/lib/super-admin — this exercises the real
// requireSuperAdmin() (the exact gate every reviewer-access action uses),
// only mocking its one dependency (the platform-admin cookie session), to
// prove a tenant session (which never has a platform-admin cookie at all —
// it's a wholly separate session system) cannot pass this gate. This is
// what makes "reviewer organisation cannot access platform-admin routes"
// true, including for the reviewer account itself.
vi.mock("@/lib/admin-auth", () => ({ getAdminSession: vi.fn(async () => null) }));

import { requireSuperAdmin } from "@/lib/super-admin";

describe("requireSuperAdmin() — the real gate behind every reviewer-access action", () => {
  it("rejects when no platform-admin cookie session exists", async () => {
    await expect(requireSuperAdmin()).rejects.toThrow("Not authorized");
  });
});
