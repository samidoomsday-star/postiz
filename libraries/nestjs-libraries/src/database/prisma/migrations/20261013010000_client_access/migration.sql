BEGIN;
-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "ownershipQuarantined" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "ownershipQuarantined" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "agencyActorId" TEXT,
ADD COLUMN     "agencyActorType" TEXT,
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "ownershipQuarantined" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgencyGrant" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyCredential" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "clientIds" TEXT[],
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "actions" TEXT[] DEFAULT ARRAY['content:read', 'draft:write']::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "AgencyCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyAudit" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyGrant_organizationId_userId_idx" ON "AgencyGrant"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyGrant_organizationId_userId_clientId_role_key" ON "AgencyGrant"("organizationId", "userId", "clientId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyCredential_secretHash_key" ON "AgencyCredential"("secretHash");

-- CreateIndex
CREATE INDEX "AgencyCredential_organizationId_idx" ON "AgencyCredential"("organizationId");

-- CreateIndex
CREATE INDEX "AgencyAudit_organizationId_createdAt_idx" ON "AgencyAudit"("organizationId", "createdAt");

-- Deterministic backfill: never infer grants from old billing roles or API keys.
UPDATE "Organization" SET "apiKey" = NULL;
UPDATE "Integration" i SET "customerId"=NULL WHERE "customerId" IS NOT NULL AND NOT EXISTS
(SELECT 1 FROM "Customer" c WHERE c.id=i."customerId" AND c."orgId"=i."organizationId" AND c."deletedAt" IS NULL);
UPDATE "Integration" i SET "ownershipQuarantined" = false
FROM "Customer" c WHERE i."customerId"=c.id AND i."organizationId"=c."orgId"
AND c."deletedAt" IS NULL AND i."deletedAt" IS NULL;
UPDATE "Post" p SET "clientId"=i."customerId", "ownershipQuarantined"=false
FROM "Integration" i WHERE p."integrationId"=i.id AND p."organizationId"=i."organizationId"
AND NOT i."ownershipQuarantined";
-- A logical group must not span clients/agencies, even if each target is valid.
UPDATE "Post" SET "ownershipQuarantined"=true, "clientId"=NULL
WHERE "group" IN (SELECT "group" FROM "Post" GROUP BY "group"
HAVING count(DISTINCT ("organizationId", "clientId")) > 1 OR bool_or("ownershipQuarantined"));
-- Pause all legacy queued work, including mapped posts. No originating principal.
UPDATE "Post" SET state='DRAFT' WHERE state='QUEUE';
-- Images have no prior client boundary; retain them in quarantine for explicit mapping.

CREATE FUNCTION agency_ownership_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='Integration' THEN
    IF NOT NEW."ownershipQuarantined" AND NOT EXISTS
      (SELECT 1 FROM "Customer" WHERE id=NEW."customerId" AND "orgId"=NEW."organizationId" AND "deletedAt" IS NULL)
    THEN RAISE EXCEPTION 'invalid agency channel ownership'; END IF;
  ELSIF TG_TABLE_NAME='Post' THEN
    IF NOT NEW."ownershipQuarantined" AND NOT EXISTS
      (SELECT 1 FROM "Integration" i JOIN "Customer" c ON c.id=i."customerId"
       WHERE i.id=NEW."integrationId" AND i."organizationId"=NEW."organizationId"
       AND i."customerId"=NEW."clientId" AND c."orgId"=NEW."organizationId"
       AND NOT i."ownershipQuarantined" AND i."deletedAt" IS NULL AND c."deletedAt" IS NULL)
    THEN RAISE EXCEPTION 'invalid agency post ownership'; END IF;
  ELSIF TG_TABLE_NAME='Media' THEN
    IF NOT NEW."ownershipQuarantined" AND NOT EXISTS
      (SELECT 1 FROM "Customer" WHERE id=NEW."clientId" AND "orgId"=NEW."organizationId" AND "deletedAt" IS NULL)
    THEN RAISE EXCEPTION 'invalid agency media ownership'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER agency_channel_owner BEFORE INSERT OR UPDATE ON "Integration" FOR EACH ROW EXECUTE FUNCTION agency_ownership_check();
CREATE TRIGGER agency_post_owner BEFORE INSERT OR UPDATE ON "Post" FOR EACH ROW EXECUTE FUNCTION agency_ownership_check();
CREATE TRIGGER agency_media_owner BEFORE INSERT OR UPDATE ON "Media" FOR EACH ROW EXECUTE FUNCTION agency_ownership_check();
CREATE FUNCTION agency_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'agency audit is append-only'; END $$;
CREATE TRIGGER agency_audit_immutable BEFORE UPDATE OR DELETE ON "AgencyAudit" FOR EACH ROW EXECUTE FUNCTION agency_audit_append_only();

COMMIT;
