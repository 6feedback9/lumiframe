-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('STARTER', 'GROWTH', 'PRO');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "planId" TEXT,
ADD COLUMN     "planRequestNote" TEXT,
ADD COLUMN     "planRequestedAt" TIMESTAMP(3),
ADD COLUMN     "topUpCredits" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "key" "PlanKey" NOT NULL,
    "name" TEXT NOT NULL,
    "monthlyLimit" INTEGER NOT NULL,
    "priceUsd" DECIMAL(10,2) NOT NULL,
    "topUpPackSize" INTEGER NOT NULL,
    "topUpPackPriceUsd" DECIMAL(10,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_key_key" ON "plans"("key");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
