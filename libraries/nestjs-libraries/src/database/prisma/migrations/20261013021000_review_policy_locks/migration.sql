BEGIN;
CREATE OR REPLACE FUNCTION agency_policy_lock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE scope_id TEXT; row_data JSONB;
BEGIN
 row_data=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 scope_id=row_data->>'organizationId';
 IF scope_id IS NULL AND row_data->>'workId' IS NOT NULL THEN SELECT "organizationId" INTO scope_id FROM "AgencyWork" WHERE id=row_data->>'workId'; END IF;
 IF scope_id IS NULL AND row_data->>'revisionId' IS NOT NULL THEN SELECT "organizationId" INTO scope_id FROM "AgencyRevision" WHERE id=row_data->>'revisionId'; END IF;
 IF scope_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('agency-policy:'||scope_id,0)); END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER agency_work_policy_lock BEFORE UPDATE OR DELETE ON "AgencyWork" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER agency_review_policy_lock BEFORE UPDATE OR DELETE ON "AgencyReviewRequest" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE INDEX "Post_agencyWorkId_idx" ON "Post"("agencyWorkId");
CREATE INDEX "Post_agencyRevisionId_idx" ON "Post"("agencyRevisionId");
COMMIT;
