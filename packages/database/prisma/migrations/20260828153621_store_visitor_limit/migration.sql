-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "maxTryOnsPerVisitor" INTEGER;

-- AlterTable
ALTER TABLE "tryon_sessions" ADD COLUMN     "visitorIp" TEXT;

-- CreateIndex
CREATE INDEX "tryon_sessions_storeId_visitorIp_idx" ON "tryon_sessions"("storeId", "visitorIp");
