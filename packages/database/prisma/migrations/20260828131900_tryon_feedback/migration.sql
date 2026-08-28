-- CreateEnum
CREATE TYPE "TryOnFeedback" AS ENUM ('LIKE', 'DISLIKE');

-- AlterTable
ALTER TABLE "tryon_sessions" ADD COLUMN     "feedback" "TryOnFeedback",
ADD COLUMN     "feedbackAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tryon_sessions_tenantId_feedback_idx" ON "tryon_sessions"("tenantId", "feedback");
