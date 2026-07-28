-- Platform admin becomes a fully standalone identity, decoupled from the
-- tenant User/Organization model entirely (no more self-registering a
-- tenant account and then being promoted). Existing push_subscriptions
-- rows are dropped and recreated against the new table since none had
-- meaningfully accumulated yet.

DROP TABLE "push_subscriptions";

CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_admins_email_key" ON "platform_admins"("email");

CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "platformAdminId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

CREATE INDEX "push_subscriptions_platformAdminId_idx" ON "push_subscriptions"("platformAdminId");

ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "platform_admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over whoever currently holds isPlatformSuperAdmin on the old User
-- model so they don't have to redo the bootstrap step with a fresh
-- password — same email, same password hash, now a real standalone admin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "platform_admins" ("id", "email", "passwordHash", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "email", "passwordHash", now(), now()
FROM "users"
WHERE "isPlatformSuperAdmin" = true AND "passwordHash" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;

ALTER TABLE "users" DROP COLUMN "isPlatformSuperAdmin";
