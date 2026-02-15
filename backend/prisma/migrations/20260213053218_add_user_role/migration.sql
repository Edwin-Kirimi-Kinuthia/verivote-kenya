-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('VOTER', 'ADMIN');

-- AlterTable
ALTER TABLE "voters" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'VOTER';

-- CreateIndex
CREATE INDEX "voters_role_idx" ON "voters"("role");
