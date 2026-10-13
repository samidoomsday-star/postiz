BEGIN;
CREATE OR REPLACE FUNCTION agency_post_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."agencyRevisionId" IS NOT NULL THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'revision content cannot be deleted'; END IF;
  IF ROW(NEW.content,NEW.image,NEW.settings,NEW."publishDate",NEW."integrationId",NEW."organizationId",NEW."group",NEW."parentPostId",NEW."agencyRevisionId",NEW."agencyWorkId",NEW.delay,NEW."intervalInDays",NEW."batchId")
    IS DISTINCT FROM ROW(OLD.content,OLD.image,OLD.settings,OLD."publishDate",OLD."integrationId",OLD."organizationId",OLD."group",OLD."parentPostId",OLD."agencyRevisionId",OLD."agencyWorkId",OLD.delay,OLD."intervalInDays",OLD."batchId")
  THEN RAISE EXCEPTION 'revision content cannot be mutated'; END IF;
 END IF;
 RETURN NEW;
END $$;
COMMIT;
