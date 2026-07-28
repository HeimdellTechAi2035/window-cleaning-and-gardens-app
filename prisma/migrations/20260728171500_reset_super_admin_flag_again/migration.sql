-- Second reset: the previous bootstrap attempt landed on an unintended
-- account. Clears isPlatformSuperAdmin from every account again so the
-- next /admin-bootstrap attempt is guaranteed to grant it to the intended
-- account only.
UPDATE "users" SET "isPlatformSuperAdmin" = false;
