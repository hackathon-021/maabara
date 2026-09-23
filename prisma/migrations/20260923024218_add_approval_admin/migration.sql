-- AlterTable
ALTER TABLE "users" ADD COLUMN     "approval_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requested_commander_id" INTEGER;

-- Grandfather every user that existed before the approval gate: only new
-- signups from here on start as 'pending'.
UPDATE "users" SET "approval_status" = 'approved';
