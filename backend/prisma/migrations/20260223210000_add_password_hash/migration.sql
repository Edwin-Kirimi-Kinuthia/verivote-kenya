-- Add optional password hash for email/phone + password login
ALTER TABLE "voters" ADD COLUMN "password_hash" VARCHAR(255);
