BEGIN;
-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "agencyRevisionId" TEXT,
ADD COLUMN     "agencyWorkId" TEXT;

-- CreateTable
CREATE TABLE "AgencyWork" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyRevision" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewRequest" (
    "id" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_REVIEW',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewDecision" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyCommand" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyCommand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyDispatch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'publish',
    "state" TEXT NOT NULL DEFAULT 'READY',
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "result" JSONB,
    "pendingData" JSONB,
    "providerId" TEXT,
    "providerUrl" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyMediaSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyMediaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgencyWork_organizationId_clientId_createdAt_idx" ON "AgencyWork"("organizationId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "AgencyRevision_organizationId_clientId_idx" ON "AgencyRevision"("organizationId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyRevision_workId_version_key" ON "AgencyRevision"("workId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyReviewRequest_revisionId_key" ON "AgencyReviewRequest"("revisionId");

-- CreateIndex
CREATE INDEX "AgencyReviewRequest_reviewerId_status_idx" ON "AgencyReviewRequest"("reviewerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyReviewDecision_requestId_key" ON "AgencyReviewDecision"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyCommand_organizationId_actorType_actorId_operationId_key" ON "AgencyCommand"("organizationId", "actorType", "actorId", "operationId");

-- CreateIndex
CREATE INDEX "AgencyDispatch_postId_stage_idx" ON "AgencyDispatch"("postId", "stage");

-- CreateIndex
CREATE INDEX "AgencyDispatch_organizationId_clientId_state_idx" ON "AgencyDispatch"("organizationId", "clientId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyDispatch_revisionId_channelId_part_stage_key" ON "AgencyDispatch"("revisionId", "channelId", "part", "stage");

-- CreateIndex
CREATE INDEX "AgencyMediaSnapshot_revisionId_idx" ON "AgencyMediaSnapshot"("revisionId");

-- CreateIndex
CREATE INDEX "AgencyMediaSnapshot_sourceMediaId_idx" ON "AgencyMediaSnapshot"("sourceMediaId");


-- Every policy write participates in the same per-agency linearization lock.
-- Claims acquire it before reading current eligibility; handlers acquire it
-- before changing work. No lock is held over a provider network request.
CREATE FUNCTION agency_policy_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id TEXT; row_data JSONB;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 scope_id=row_data->>'organizationId';
 IF scope_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('agency-policy:'||scope_id,0)); END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER agency_grant_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyGrant" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_key_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyCredential" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_member_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "UserOrganization" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_integration_policy_lock BEFORE UPDATE OR DELETE ON "Integration" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_media_policy_lock BEFORE UPDATE OR DELETE ON "Media" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_post_policy_lock BEFORE UPDATE OR DELETE ON "Post" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE FUNCTION agency_user_policy_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id TEXT;
BEGIN
 FOR scope_id IN SELECT "organizationId" FROM "UserOrganization" WHERE "userId"=OLD.id ORDER BY "organizationId" LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('agency-policy:'||scope_id,0));
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER agency_user_policy_lock BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION agency_user_policy_lock();
CREATE FUNCTION agency_immutable_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'agency approved history is immutable'; END $$;
CREATE TRIGGER agency_revision_immutable BEFORE UPDATE OR DELETE ON "AgencyRevision" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE TRIGGER agency_decision_immutable BEFORE UPDATE OR DELETE ON "AgencyReviewDecision" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE TRIGGER agency_snapshot_immutable BEFORE UPDATE OR DELETE ON "AgencyMediaSnapshot" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE TRIGGER agency_command_immutable BEFORE UPDATE OR DELETE ON "AgencyCommand" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE FUNCTION agency_post_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."agencyRevisionId" IS NOT NULL THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revision content cannot be deleted'; END IF;
  IF ROW(NEW.content,NEW.image,NEW.settings,NEW."publishDate",NEW."integrationId",NEW."organizationId",NEW."group",NEW."parentPostId",NEW."agencyRevisionId")
    IS DISTINCT FROM ROW(OLD.content,OLD.image,OLD.settings,OLD."publishDate",OLD."integrationId",OLD."organizationId",OLD."group",OLD."parentPostId",OLD."agencyRevisionId")
  THEN RAISE EXCEPTION 'revision content cannot be mutated'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER agency_revision_post_immutable BEFORE UPDATE OR DELETE ON "Post" FOR EACH ROW EXECUTE FUNCTION agency_post_revision_immutable();
CREATE FUNCTION agency_referenced_media() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM "AgencyMediaSnapshot" s JOIN "AgencyRevision" r ON r.id=s."revisionId" JOIN "AgencyWork" w ON w.id=r."workId"
 WHERE s."sourceMediaId"=OLD.id AND w."currentVersion"=r.version AND w.status IN ('IN_REVIEW','APPROVED','SCHEDULED')) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'media referenced by active review cannot be deleted'; END IF;
  IF ROW(NEW.path,NEW.alt,NEW.thumbnail,NEW.status,NEW."deletedAt",NEW."clientId",NEW."ownershipQuarantined") IS DISTINCT FROM
     ROW(OLD.path,OLD.alt,OLD.thumbnail,OLD.status,OLD."deletedAt",OLD."clientId",OLD."ownershipQuarantined")
  THEN RAISE EXCEPTION 'media referenced by active review cannot be changed'; END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER agency_review_media_guard BEFORE UPDATE OR DELETE ON "Media" FOR EACH ROW EXECUTE FUNCTION agency_referenced_media();
-- Existing Phase 1 queues never acquire inferred approvals or a revision.
UPDATE "Post" SET state='DRAFT' WHERE state='QUEUE';
COMMIT;
