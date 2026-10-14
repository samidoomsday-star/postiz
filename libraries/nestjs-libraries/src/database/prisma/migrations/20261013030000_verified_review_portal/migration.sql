BEGIN;
-- AlterTable
ALTER TABLE "AgencyReviewDecision" ADD COLUMN     "reviewInvitationId" TEXT;

-- CreateTable
CREATE TABLE "AgencyReviewInvitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "channelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "exchangedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewChallenge" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewerSession" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewThrottle" (
    "id" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgencyReviewThrottle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgencyReviewComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgencyReviewComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgencyReviewInvitation_tokenHash_key" ON "AgencyReviewInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AgencyReviewInvitation_organizationId_clientId_reviewerId_idx" ON "AgencyReviewInvitation"("organizationId", "clientId", "reviewerId");

-- CreateIndex
CREATE INDEX "AgencyReviewChallenge_invitationId_idx" ON "AgencyReviewChallenge"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyReviewerSession_invitationId_key" ON "AgencyReviewerSession"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "AgencyReviewerSession_secretHash_key" ON "AgencyReviewerSession"("secretHash");

-- CreateIndex
CREATE INDEX "AgencyReviewerSession_organizationId_clientId_idx" ON "AgencyReviewerSession"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "AgencyReviewComment_workId_createdAt_idx" ON "AgencyReviewComment"("workId", "createdAt");


ALTER TABLE "AgencyReviewInvitation" ADD CONSTRAINT review_invite_org_fk FOREIGN KEY ("organizationId") REFERENCES "Organization"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewInvitation" ADD CONSTRAINT review_invite_client_fk FOREIGN KEY ("clientId") REFERENCES "Customer"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewInvitation" ADD CONSTRAINT review_invite_user_fk FOREIGN KEY ("reviewerId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewInvitation" ADD CONSTRAINT review_invite_creator_fk FOREIGN KEY ("creatorId") REFERENCES "User"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewChallenge" ADD CONSTRAINT review_challenge_invite_fk FOREIGN KEY ("invitationId") REFERENCES "AgencyReviewInvitation"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewerSession" ADD CONSTRAINT review_session_invite_fk FOREIGN KEY ("invitationId") REFERENCES "AgencyReviewInvitation"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewDecision" ADD CONSTRAINT review_decision_invite_fk FOREIGN KEY ("reviewInvitationId") REFERENCES "AgencyReviewInvitation"(id) ON DELETE RESTRICT;
ALTER TABLE "AgencyReviewComment" ADD CONSTRAINT review_comment_revision_fk FOREIGN KEY ("revisionId") REFERENCES "AgencyRevision"(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX review_one_active_invitation ON "AgencyReviewInvitation"("organizationId","clientId","reviewerId") WHERE "revokedAt" IS NULL;
CREATE OR REPLACE FUNCTION agency_policy_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id TEXT; row_data JSONB;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 scope_id=COALESCE(row_data->>'organizationId',row_data->>'orgId');
 IF TG_TABLE_NAME='Organization' THEN scope_id=row_data->>'id'; END IF;
 IF scope_id IS NULL AND row_data->>'invitationId' IS NOT NULL THEN SELECT "organizationId" INTO scope_id FROM "AgencyReviewInvitation" WHERE id=row_data->>'invitationId'; END IF;
 IF scope_id IS NULL AND row_data->>'workId' IS NOT NULL THEN SELECT "organizationId" INTO scope_id FROM "AgencyWork" WHERE id=row_data->>'workId'; END IF;
 IF scope_id IS NULL AND row_data->>'revisionId' IS NOT NULL THEN SELECT "organizationId" INTO scope_id FROM "AgencyRevision" WHERE id=row_data->>'revisionId'; END IF;
 IF scope_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('agency-policy:'||scope_id,0)); END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER review_invitation_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyReviewInvitation" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER review_session_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyReviewerSession" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER review_challenge_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyReviewChallenge" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER review_customer_policy_lock BEFORE UPDATE OR DELETE ON "Customer" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER review_organization_policy_lock BEFORE UPDATE OR DELETE ON "Organization" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER review_comment_immutable BEFORE UPDATE OR DELETE ON "AgencyReviewComment" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE FUNCTION agency_review_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE inv "AgencyReviewInvitation"; rev "AgencyRevision";
BEGIN
 IF TG_TABLE_NAME='AgencyReviewerSession' THEN
  SELECT * INTO inv FROM "AgencyReviewInvitation" WHERE id=NEW."invitationId";
  IF inv.id IS NULL OR ROW(NEW."organizationId",NEW."clientId",NEW."reviewerId") IS DISTINCT FROM ROW(inv."organizationId",inv."clientId",inv."reviewerId") OR NEW."expiresAt">inv."expiresAt" OR NEW."expiresAt">NEW."createdAt"+interval '24 hours' THEN RAISE EXCEPTION 'review session scope/lifetime mismatch'; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW."organizationId",NEW."clientId",NEW."reviewerId",NEW."invitationId",NEW."secretHash",NEW."createdAt") IS DISTINCT FROM ROW(OLD."organizationId",OLD."clientId",OLD."reviewerId",OLD."invitationId",OLD."secretHash",OLD."createdAt") THEN RAISE EXCEPTION 'review session identity immutable'; END IF;
 ELSIF TG_TABLE_NAME='AgencyReviewInvitation' THEN
  IF NOT EXISTS(SELECT 1 FROM "Customer" WHERE id=NEW."clientId" AND "orgId"=NEW."organizationId") OR NEW."expiresAt">NEW."createdAt"+interval '7 days' THEN RAISE EXCEPTION 'review invitation scope/lifetime mismatch'; END IF;
  IF TG_OP='UPDATE' AND ROW(NEW."organizationId",NEW."clientId",NEW."reviewerId",NEW."creatorId",NEW."channelIds",NEW.email,NEW."tokenHash",NEW."createdAt") IS DISTINCT FROM ROW(OLD."organizationId",OLD."clientId",OLD."reviewerId",OLD."creatorId",OLD."channelIds",OLD.email,OLD."tokenHash",OLD."createdAt") THEN RAISE EXCEPTION 'review invitation identity immutable'; END IF;
 ELSIF TG_TABLE_NAME='AgencyReviewComment' THEN
  SELECT * INTO rev FROM "AgencyRevision" WHERE id=NEW."revisionId";
  IF rev.id IS NULL OR ROW(NEW."organizationId",NEW."clientId",NEW."workId") IS DISTINCT FROM ROW(rev."organizationId",rev."clientId",rev."workId") THEN RAISE EXCEPTION 'review comment scope mismatch'; END IF;
 ELSIF TG_TABLE_NAME='AgencyReviewDecision' AND NEW."reviewInvitationId" IS NOT NULL THEN
  SELECT * INTO inv FROM "AgencyReviewInvitation" WHERE id=NEW."reviewInvitationId";
  SELECT * INTO rev FROM "AgencyRevision" WHERE id=NEW."revisionId";
  IF inv.id IS NULL OR rev.id IS NULL OR ROW(inv."organizationId",inv."clientId",inv."reviewerId") IS DISTINCT FROM ROW(rev."organizationId",rev."clientId",NEW."actorId") THEN RAISE EXCEPTION 'review decision invitation mismatch'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER review_session_scope BEFORE INSERT OR UPDATE ON "AgencyReviewerSession" FOR EACH ROW EXECUTE FUNCTION agency_review_scope_guard();
CREATE TRIGGER review_invitation_scope BEFORE INSERT OR UPDATE ON "AgencyReviewInvitation" FOR EACH ROW EXECUTE FUNCTION agency_review_scope_guard();
CREATE TRIGGER review_comment_scope BEFORE INSERT ON "AgencyReviewComment" FOR EACH ROW EXECUTE FUNCTION agency_review_scope_guard();
CREATE TRIGGER review_decision_scope BEFORE INSERT ON "AgencyReviewDecision" FOR EACH ROW EXECUTE FUNCTION agency_review_scope_guard();
COMMIT;
