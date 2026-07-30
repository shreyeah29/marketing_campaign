-- CreateEnum
CREATE TYPE "PublishState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "lead_form" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PublishState" NOT NULL DEFAULT 'DRAFT',
    "fields" JSONB NOT NULL DEFAULT '[]',
    "headline" TEXT,
    "description" TEXT,
    "submit_label" TEXT,
    "success_message" TEXT,
    "redirect_url" TEXT,
    "accent_color" TEXT,
    "pipeline_id" TEXT,
    "owner_id" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "submit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "lead_form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_submission" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "contact_id" TEXT,
    "lead_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "referrer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_page" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "PublishState" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "theme" JSONB,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "og_image_url" TEXT,
    "form_id" TEXT,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "landing_page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "priority" NOT NULL DEFAULT 'MEDIUM',
    "requester_id" TEXT,
    "requester_email" TEXT,
    "assignee_id" TEXT,
    "contact_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "support_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_comment" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "author_id" TEXT,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_form_organization_id_status_deleted_at_idx" ON "lead_form"("organization_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_form_organization_id_slug_key" ON "lead_form"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "form_submission_organization_id_form_id_idx" ON "form_submission"("organization_id", "form_id");

-- CreateIndex
CREATE INDEX "form_submission_organization_id_created_at_idx" ON "form_submission"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "landing_page_organization_id_status_deleted_at_idx" ON "landing_page"("organization_id", "status", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "landing_page_organization_id_slug_key" ON "landing_page"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "support_ticket_organization_id_status_deleted_at_idx" ON "support_ticket"("organization_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "support_ticket_organization_id_assignee_id_idx" ON "support_ticket"("organization_id", "assignee_id");

-- CreateIndex
CREATE INDEX "support_ticket_comment_organization_id_ticket_id_idx" ON "support_ticket_comment"("organization_id", "ticket_id");

-- AddForeignKey
ALTER TABLE "lead_form" ADD CONSTRAINT "lead_form_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "lead_form"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submission" ADD CONSTRAINT "form_submission_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_page" ADD CONSTRAINT "landing_page_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket" ADD CONSTRAINT "support_ticket_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_comment" ADD CONSTRAINT "support_ticket_comment_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_comment" ADD CONSTRAINT "support_ticket_comment_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Row-level security (hand-appended; Prisma does not generate it) ──────────
ALTER TABLE "lead_form" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "lead_form" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "form_submission" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "form_submission" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "landing_page" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "landing_page" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "support_ticket" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_ticket" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());

ALTER TABLE "support_ticket_comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "support_ticket_comment" FOR ALL
    USING ("organization_id" = app.current_organization_id())
    WITH CHECK ("organization_id" = app.current_organization_id());
