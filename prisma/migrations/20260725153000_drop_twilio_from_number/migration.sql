-- The Settings "Twilio SMS from number" field was removed — job-completion
-- texts now open the worker's own Messages app instead of going through
-- Twilio, and this field was never wired to anything else.
ALTER TABLE "organizations" DROP COLUMN "twilioFromNumber";
