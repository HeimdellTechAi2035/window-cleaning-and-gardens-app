-- Clears isPlatformSuperAdmin from every account so the one-time
-- /admin-bootstrap flow (gated by SUPER_ADMIN_BOOTSTRAP_SECRET) can be
-- redone cleanly with a specific, deliberately chosen account.
UPDATE "users" SET "isPlatformSuperAdmin" = false;
