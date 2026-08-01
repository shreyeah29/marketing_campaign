-- CreateEnum
CREATE TYPE "insight_dimension" AS ENUM ('AGE', 'GENDER', 'REGION', 'COUNTRY', 'PLATFORM');

-- CreateTable
CREATE TABLE "ad_insight_breakdown" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "campaign_id" TEXT,
    "ad_id" TEXT,
    "date" DATE NOT NULL,
    "dimension" "insight_dimension" NOT NULL,
    "value" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_insight_breakdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_insight_breakdown_organization_id_dimension_date_idx" ON "ad_insight_breakdown"("organization_id", "dimension", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ad_insight_breakdown_campaign_id_ad_id_date_dimension_value_key" ON "ad_insight_breakdown"("campaign_id", "ad_id", "date", "dimension", "value");

-- AddForeignKey
ALTER TABLE "ad_insight_breakdown" ADD CONSTRAINT "ad_insight_breakdown_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_insight_breakdown" ADD CONSTRAINT "ad_insight_breakdown_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "ad_campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
