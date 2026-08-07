import { describe, it, expect, vi, beforeAll } from "vitest";
import bcrypt from "bcryptjs";

// Real bcrypt.compare is used (not mocked) to faithfully exercise both
// login paths, but the fixture hash is generated at a low cost factor
// purely for test speed — bcrypt.compare works the same regardless of the
// cost embedded in the hash, and production code always hashes at cost 12
// (see app/actions/auth.ts, app/actions/admin-bootstrap.ts). Same pattern
// as tests/account-deletion-actions.test.ts.
const PASSWORD = "correct-horse-battery-staple";
let passwordHash: string;

beforeAll(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

const redirectMock = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (...args: unknown[]) => redirectMock(...args) }));

const createAdminSessionMock = vi.fn();
vi.mock("@/lib/admin-auth", () => ({
  createAdminSession: (...args: unknown[]) => createAdminSessionMock(...args),
  clearAdminSession: vi.fn(),
}));

const platformAdminFindUnique = vi.fn();
const userFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    platformAdmin: { findUnique: (...args: unknown[]) => platformAdminFindUnique(...args) },
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
  },
}));

import { adminLoginAction } from "@/app/actions/admin-auth";
import { authorizeTenantCredentials } from "@/lib/tenant-credentials";

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("platform-admin and tenant authentication remain fully separate", () => {
  it("normal user login still works: correct tenant credentials authorize", async () => {
    userFindUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Alex",
      email: "alex@greenfix.example",
      image: null,
      passwordHash,
      organizationId: "org-1",
      role: "ADMIN",
      isActive: true,
    });

    const result = await authorizeTenantCredentials("alex@greenfix.example", PASSWORD);

    expect(result).toEqual({
      id: "user-1",
      name: "Alex",
      email: "alex@greenfix.example",
      image: null,
      organizationId: "org-1",
      role: "ADMIN",
    });
    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: "alex@greenfix.example" } });
  });

  it("tenant credentials cannot authenticate at /admin-login", async () => {
    // Tenant emails/passwords live only in the User table. adminLoginAction
    // only ever queries platformAdmin, so a tenant's email simply isn't
    // found there — this is what the mock represents.
    platformAdminFindUnique.mockResolvedValueOnce(null);

    const result = await adminLoginAction(
      formData({ email: "alex@greenfix.example", password: PASSWORD })
    );

    expect(result).toEqual({ error: "Incorrect email or password" });
    expect(platformAdminFindUnique).toHaveBeenCalledWith({ where: { email: "alex@greenfix.example" } });
    expect(createAdminSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("platform-admin credentials cannot accidentally authenticate as a tenant user", async () => {
    // Platform-admin emails/passwords live only in the platform_admins
    // table. authorizeTenantCredentials only ever queries prisma.user, so
    // an admin's email simply isn't found there — this is what the mock
    // represents.
    userFindUnique.mockResolvedValueOnce(null);

    const result = await authorizeTenantCredentials("admin@heimdell-tech-ai.co.uk", PASSWORD);

    expect(result).toBeNull();
    expect(userFindUnique).toHaveBeenCalledWith({ where: { email: "admin@heimdell-tech-ai.co.uk" } });
  });

  it("valid platform-admin credentials do authenticate at /admin-login (positive control)", async () => {
    platformAdminFindUnique.mockResolvedValueOnce({
      id: "admin-1",
      email: "admin@heimdell-tech-ai.co.uk",
      passwordHash,
    });

    const result = await adminLoginAction(
      formData({ email: "admin@heimdell-tech-ai.co.uk", password: PASSWORD })
    );

    expect(result).toBeUndefined(); // falls through to redirect() on success
    expect(createAdminSessionMock).toHaveBeenCalledWith({ id: "admin-1", email: "admin@heimdell-tech-ai.co.uk" });
    expect(redirectMock).toHaveBeenCalledWith("/admin");
  });
});
