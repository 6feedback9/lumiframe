-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'GENERIC', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StoreStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('NOT_CONFIGURED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "TryOnStatus" AS ENUM ('CREATED', 'UPLOADING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WIDGET_OPENED', 'PHOTO_SELECTED', 'TRYON_STARTED', 'TRYON_COMPLETED', 'TRYON_FAILED', 'RESULT_VIEWED', 'TRY_ANOTHER', 'BACK_TO_PRODUCT', 'ADD_TO_CART', 'TRYON_ADD_TO_CART', 'CHECKOUT_STARTED', 'ORDER_COMPLETED', 'TRYON_ORDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AttributionModel" AS ENUM ('LAST_TOUCH');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OWNER',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "platformType" "PlatformType" NOT NULL DEFAULT 'GENERIC',
    "status" "StoreStatus" NOT NULL DEFAULT 'PENDING',
    "allowedDomains" TEXT[],
    "widgetConfig" JSONB NOT NULL DEFAULT '{}',
    "customerImageRetentionHours" INTEGER,
    "tryonResultRetentionHours" INTEGER,
    "attributionWindowHours" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "platformType" "PlatformType" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "encryptedCredentials" TEXT,
    "installedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryon_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "productTitle" TEXT,
    "productUrl" TEXT,
    "productImageUrl" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(12,2),
    "currency" TEXT,
    "visitorId" TEXT NOT NULL,
    "browserSessionId" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmTerm" TEXT,
    "utmContent" TEXT,
    "gclid" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "referrer" TEXT,
    "device" TEXT,
    "status" "TryOnStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "tryon_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tryon_generations" (
    "id" TEXT NOT NULL,
    "tryOnSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerImageKey" TEXT,
    "customerImageMimeType" TEXT,
    "productAssetKey" TEXT,
    "productAssetMimeType" TEXT,
    "resultImageKey" TEXT,
    "resultImageMimeType" TEXT,
    "status" "TryOnStatus" NOT NULL DEFAULT 'CREATED',
    "provider" TEXT,
    "providerJobId" TEXT,
    "generationDurationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "tryon_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "tryOnSessionId" TEXT,
    "externalProductId" TEXT,
    "visitorId" TEXT NOT NULL,
    "browserSessionId" TEXT,
    "utm" JSONB,
    "referrer" TEXT,
    "device" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "visitorId" TEXT,
    "currency" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PAID',
    "placedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "externalProductId" TEXT NOT NULL,
    "title" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attributions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tryOnSessionId" TEXT NOT NULL,
    "model" "AttributionModel" NOT NULL DEFAULT 'LAST_TOUCH',
    "windowHours" INTEGER NOT NULL,
    "minutesBetween" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "tryOnGenerationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "providerCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "stores_tenantId_idx" ON "stores"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_hashedKey_key" ON "api_keys"("hashedKey");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_storeId_idx" ON "api_keys"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_storeId_key" ON "integrations"("storeId");

-- CreateIndex
CREATE INDEX "tryon_sessions_tenantId_storeId_createdAt_idx" ON "tryon_sessions"("tenantId", "storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tryon_sessions_storeId_externalProductId_idx" ON "tryon_sessions"("storeId", "externalProductId");

-- CreateIndex
CREATE INDEX "tryon_sessions_visitorId_idx" ON "tryon_sessions"("visitorId");

-- CreateIndex
CREATE INDEX "tryon_generations_tryOnSessionId_idx" ON "tryon_generations"("tryOnSessionId");

-- CreateIndex
CREATE INDEX "tryon_generations_tenantId_storeId_status_idx" ON "tryon_generations"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "tryon_generations_providerJobId_idx" ON "tryon_generations"("providerJobId");

-- CreateIndex
CREATE INDEX "events_tenantId_storeId_occurredAt_idx" ON "events"("tenantId", "storeId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "events_tryOnSessionId_idx" ON "events"("tryOnSessionId");

-- CreateIndex
CREATE INDEX "events_type_occurredAt_idx" ON "events"("type", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "orders_tenantId_storeId_placedAt_idx" ON "orders"("tenantId", "storeId", "placedAt" DESC);

-- CreateIndex
CREATE INDEX "orders_visitorId_idx" ON "orders"("visitorId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_storeId_externalOrderId_key" ON "orders"("storeId", "externalOrderId");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_externalProductId_idx" ON "order_items"("externalProductId");

-- CreateIndex
CREATE UNIQUE INDEX "attributions_orderId_key" ON "attributions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "attributions_tryOnSessionId_key" ON "attributions"("tryOnSessionId");

-- CreateIndex
CREATE INDEX "attributions_tenantId_storeId_idx" ON "attributions"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_tryOnGenerationId_key" ON "usage_records"("tryOnGenerationId");

-- CreateIndex
CREATE INDEX "usage_records_tenantId_storeId_createdAt_idx" ON "usage_records"("tenantId", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_sessions" ADD CONSTRAINT "tryon_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_sessions" ADD CONSTRAINT "tryon_sessions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tryon_generations" ADD CONSTRAINT "tryon_generations_tryOnSessionId_fkey" FOREIGN KEY ("tryOnSessionId") REFERENCES "tryon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tryOnSessionId_fkey" FOREIGN KEY ("tryOnSessionId") REFERENCES "tryon_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attributions" ADD CONSTRAINT "attributions_tryOnSessionId_fkey" FOREIGN KEY ("tryOnSessionId") REFERENCES "tryon_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_tryOnGenerationId_fkey" FOREIGN KEY ("tryOnGenerationId") REFERENCES "tryon_generations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
