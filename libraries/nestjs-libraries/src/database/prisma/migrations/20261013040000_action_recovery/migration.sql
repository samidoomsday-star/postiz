BEGIN;
ALTER TABLE "AgencyDispatch" ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt>=0);
CREATE TABLE "AgencyActionRecord" (
 id TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"clientId" TEXT NOT NULL,"workId" TEXT NOT NULL,"revisionId" TEXT NOT NULL UNIQUE,"ownerId" TEXT,
 disposition TEXT NOT NULL DEFAULT 'OPEN' CHECK(disposition IN ('OPEN','ACKNOWLEDGED','DISMISSED')),note TEXT NOT NULL DEFAULT '' CHECK(length(note)<=2000),version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),"updatedAt" TIMESTAMP(3) NOT NULL,
 FOREIGN KEY("revisionId") REFERENCES "AgencyRevision"(id) ON DELETE RESTRICT,
 FOREIGN KEY("ownerId") REFERENCES "User"(id) ON DELETE RESTRICT
);
CREATE INDEX "AgencyActionRecord_organizationId_clientId_ownerId_idx" ON "AgencyActionRecord"("organizationId","clientId","ownerId");
CREATE TABLE "AgencyRecoveryEvidence" (
 id TEXT PRIMARY KEY,"organizationId" TEXT NOT NULL,"clientId" TEXT NOT NULL,"workId" TEXT NOT NULL,"revisionId" TEXT NOT NULL,"dispatchId" TEXT NOT NULL,
 attempt INTEGER NOT NULL CHECK(attempt>=0),kind TEXT NOT NULL CHECK(kind IN ('RETRY','RECONCILE')),outcome TEXT NOT NULL,"actorId" TEXT NOT NULL,"previousState" TEXT NOT NULL,"previousReason" TEXT,"claimedAt" TIMESTAMP(3),"providerId" TEXT,"providerUrl" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY("dispatchId") REFERENCES "AgencyDispatch"(id) ON DELETE RESTRICT,
 FOREIGN KEY("actorId") REFERENCES "User"(id) ON DELETE RESTRICT
);
CREATE INDEX "AgencyRecoveryEvidence_dispatchId_createdAt_idx" ON "AgencyRecoveryEvidence"("dispatchId","createdAt");
CREATE UNIQUE INDEX agency_one_retry_proof ON "AgencyRecoveryEvidence"("dispatchId",attempt) WHERE kind='RETRY';
CREATE TRIGGER action_record_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyActionRecord" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER recovery_evidence_policy_lock BEFORE INSERT OR UPDATE OR DELETE ON "AgencyRecoveryEvidence" FOR EACH ROW EXECUTE FUNCTION agency_policy_lock();
CREATE TRIGGER recovery_evidence_immutable BEFORE UPDATE OR DELETE ON "AgencyRecoveryEvidence" FOR EACH ROW EXECUTE FUNCTION agency_immutable_record();
CREATE FUNCTION agency_action_scope() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r "AgencyRevision"; d "AgencyDispatch";
BEGIN
 SELECT * INTO r FROM "AgencyRevision" WHERE id=NEW."revisionId";
 IF r.id IS NULL OR ROW(NEW."organizationId",NEW."clientId",NEW."workId") IS DISTINCT FROM ROW(r."organizationId",r."clientId",r."workId") THEN RAISE EXCEPTION 'action revision scope mismatch'; END IF;
 IF TG_TABLE_NAME='AgencyActionRecord' THEN
  IF TG_OP='UPDATE' AND (ROW(NEW."organizationId",NEW."clientId",NEW."workId",NEW."revisionId") IS DISTINCT FROM ROW(OLD."organizationId",OLD."clientId",OLD."workId",OLD."revisionId") OR NEW.version<>OLD.version+1) THEN RAISE EXCEPTION 'action scope immutable / version conflict'; END IF;
  IF NEW."ownerId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM "UserOrganization" WHERE "organizationId"=NEW."organizationId" AND "userId"=NEW."ownerId" AND NOT disabled) THEN RAISE EXCEPTION 'action owner outside agency'; END IF;
 ELSE
  SELECT * INTO d FROM "AgencyDispatch" WHERE id=NEW."dispatchId";
  IF d.id IS NULL OR ROW(NEW."organizationId",NEW."clientId",NEW."workId",NEW."revisionId",NEW.attempt,NEW."previousState") IS DISTINCT FROM ROW(d."organizationId",d."clientId",d."workId",d."revisionId",d.attempt,d.state) THEN RAISE EXCEPTION 'recovery dispatch scope mismatch'; END IF;
  IF NEW.kind='RETRY' AND (d.state<>'FAILED' OR NEW.outcome<>'NO_SIDE_EFFECT' OR d.stage<>'publish') THEN RAISE EXCEPTION 'retry requires failed attempt proof'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER action_record_scope BEFORE INSERT OR UPDATE ON "AgencyActionRecord" FOR EACH ROW EXECUTE FUNCTION agency_action_scope();
CREATE TRIGGER recovery_evidence_scope BEFORE INSERT ON "AgencyRecoveryEvidence" FOR EACH ROW EXECUTE FUNCTION agency_action_scope();
CREATE FUNCTION agency_dispatch_attempt_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW."organizationId",NEW."clientId",NEW."workId",NEW."revisionId",NEW."postId",NEW."channelId",NEW.part,NEW.stage) IS DISTINCT FROM ROW(OLD."organizationId",OLD."clientId",OLD."workId",OLD."revisionId",OLD."postId",OLD."channelId",OLD.part,OLD.stage) THEN RAISE EXCEPTION 'dispatch identity immutable'; END IF;
 IF OLD.state='CONFIRMED' AND ROW(NEW.state,NEW."providerId",NEW."providerUrl") IS DISTINCT FROM ROW(OLD.state,OLD."providerId",OLD."providerUrl") THEN RAISE EXCEPTION 'confirmed receipt immutable'; END IF;
 IF NEW.attempt<>OLD.attempt OR (NEW.state='READY' AND OLD.state<>'READY') THEN
  IF OLD.state<>'FAILED' OR NEW.state<>'READY' OR NEW.attempt<>OLD.attempt+1 OR NOT EXISTS(SELECT 1 FROM "AgencyRecoveryEvidence" WHERE "dispatchId"=OLD.id AND attempt=OLD.attempt AND kind='RETRY' AND outcome='NO_SIDE_EFFECT') THEN RAISE EXCEPTION 'no known-safe retry evidence'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dispatch_attempt_guard BEFORE UPDATE ON "AgencyDispatch" FOR EACH ROW EXECUTE FUNCTION agency_dispatch_attempt_guard();
COMMIT;
