-- AlterEnum
ALTER TYPE "email_send_status" ADD VALUE 'SENDING';

-- AlterTable
ALTER TABLE "email_send" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0;

