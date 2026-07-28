-- Replaces the SUPER_ADMIN_EMAILS env-var-matching approach (insecure —
-- registration is public, so anyone could have raced to register that
-- exact email first and been granted admin) with an explicit per-user
-- flag, set only via the one-time bootstrap action or by an existing
-- super-admin from within /admin.
ALTER TABLE "users" ADD COLUMN "isPlatformSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
