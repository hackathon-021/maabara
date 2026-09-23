-- AlterTable
ALTER TABLE "users" ADD COLUMN     "commander_id" INTEGER,
ADD COLUMN     "rank" TEXT NOT NULL DEFAULT 'soldier';

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_commander_id_fkey" FOREIGN KEY ("commander_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
