#!/usr/bin/env python3
"""Rehearse pinned migration + interrupted transaction + backup/restore on disposable synthetic DBs."""
import os
import subprocess
import uuid
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

root = Path(__file__).resolve().parents[2]
os.chdir(root)
url = urlsplit(os.environ.get('DATABASE_URL', ''))
if os.environ.get('AGENCY_TEST_MODE') != 'true' or os.environ.get('AGENCY_TEST_ACK') != 'LOCAL_SYNTHETIC_ONLY' or url.path != '/postiz_agency_test' or url.hostname not in ['localhost', '127.0.0.1']:
    raise SystemExit('Migration rehearsal refuses nonlocal/customer settings')
base = ['docker', 'compose', '-f', 'compose.agency.yaml', 'exec', '-T', 'postgres']
name = 'agency_migration_fixture_' + uuid.uuid4().hex[:12]
restore = name + '_restore'
fresh = name + '_fresh'
interrupted = name + '_phase2_interrupt'
created = []

def command(args, payload=None, expected=0, env=None):
    result = subprocess.run(args, input=payload, capture_output=True, env=env)
    if result.returncode != expected:
        raise RuntimeError('Rehearsal command failed: ' + result.stderr.decode()[-1500:])
    return result.stdout

def sql(db, text, expected=0):
    return command(base + ['psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postiz_agency', '-d', db, '-At'], text.encode(), expected).decode()

def prisma(db, *args):
    env = dict(os.environ)
    env['DATABASE_URL'] = urlunsplit((url.scheme, url.netloc, '/' + db, url.query, url.fragment))
    return command(['pnpm', 'exec', 'prisma', 'migrate', *args, '--schema', 'libraries/nestjs-libraries/src/database/prisma/schema.prisma'], env=env)

fixture = '''
INSERT INTO "Organization" (id,name,"updatedAt","apiKey") VALUES ('a','Agency a',now(),'legacy-a'),('b','Agency b',now(),'legacy-b');
INSERT INTO "Customer" (id,name,"orgId","updatedAt") VALUES ('a1','Client a1','a',now()),('a2','Client a2','a',now()),('b1','Client b1','b',now());
INSERT INTO "Integration" (id,"internalId","organizationId",name,"providerIdentifier",type,token,"customerId","updatedAt") VALUES
('i1','synthetic-1','a','a1','synthetic','social','synthetic-token','a1',now()),
('i2','synthetic-2','a','a2','synthetic','social','synthetic-token','a2',now()),
('iu','synthetic-u','a','Unassigned','synthetic','social','synthetic-token',NULL,now()),
('if','synthetic-f','a','Foreign customer','synthetic','social','synthetic-token','b1',now());
INSERT INTO "Post" (id,state,"publishDate","organizationId","integrationId",content,"group","updatedAt") VALUES
('valid','QUEUE',now(),'a','i1','Valid mapped content','valid',now()),
('unassigned','QUEUE',now(),'a','iu','Unassigned content','unassigned',now()),
('mixed1','QUEUE',now(),'a','i1','Mixed first','mixed',now()),
('mixed2','QUEUE',now(),'a','i2','Mixed second','mixed',now()),
('foreign','QUEUE',now(),'a','if','Wrong customer','foreign',now()),
('published','PUBLISHED',now(),'a','i1','Preserve history','published',now());
INSERT INTO "Media" (id,name,path,"organizationId","updatedAt") VALUES ('m1','Legacy media','http://localhost:4200/uploads/legacy.txt','a',now());
-- Mimic tables owned by an optional upstream subsystem: migrations must preserve them.
CREATE TABLE mastra_owned_fixture (id TEXT PRIMARY KEY, payload TEXT);
INSERT INTO mastra_owned_fixture VALUES ('retained','owned by another subsystem');
'''
assertions = '''
DO $$ BEGIN
IF (SELECT count(*) FROM "Post") <> 6 THEN RAISE EXCEPTION 'content lost'; END IF;
IF (SELECT count(*) FROM "Post" WHERE state='QUEUE') <> 0 THEN RAISE EXCEPTION 'queue not paused'; END IF;
IF NOT EXISTS (SELECT 1 FROM "Post" WHERE id='valid' AND "clientId"='a1' AND NOT "ownershipQuarantined" AND "agencyActorId" IS NULL AND state='DRAFT') THEN RAISE EXCEPTION 'valid mapping incorrect'; END IF;
IF (SELECT count(*) FROM "Post" WHERE id IN ('mixed1','mixed2','unassigned','foreign') AND "ownershipQuarantined" AND "clientId" IS NULL) <> 4 THEN RAISE EXCEPTION 'ambiguous content exposed'; END IF;
IF NOT EXISTS (SELECT 1 FROM "Post" WHERE id='published' AND state='PUBLISHED') THEN RAISE EXCEPTION 'history changed'; END IF;
IF EXISTS (SELECT 1 FROM "Organization" WHERE "apiKey" IS NOT NULL) THEN RAISE EXCEPTION 'legacy key remains'; END IF;
IF EXISTS (SELECT 1 FROM "Media" WHERE NOT "ownershipQuarantined") THEN RAISE EXCEPTION 'legacy media inferred'; END IF;
IF EXISTS (SELECT 1 FROM "AgencyGrant") THEN RAISE EXCEPTION 'grants inferred'; END IF;
IF NOT EXISTS (SELECT 1 FROM mastra_owned_fixture WHERE id='retained') THEN RAISE EXCEPTION 'subsystem table lost'; END IF;
END $$;
'''
try:
    for db in [name, restore, fresh, interrupted]:
        command(base + ['createdb', '-U', 'postiz_agency', db]); created.append(db)
    prisma(fresh, 'deploy')
    assert sql(fresh, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL; SELECT count(*) FROM "AgencyGrant";').strip().splitlines() == [str(len(list((root / 'libraries/nestjs-libraries/src/database/prisma/migrations').glob('*/migration.sql')))), '0']
    migrations = root / 'libraries/nestjs-libraries/src/database/prisma/migrations'
    sql(name, (migrations / '20261013000000_upstream_baseline/migration.sql').read_text())
    sql(name, fixture)
    before = command(base + ['pg_dump', '-U', 'postiz_agency', '-d', name, '-Fc'])
    # Terminate only this disposable fixture connection after all SQL but before COMMIT.
    migration = (migrations / '20261013010000_client_access/migration.sql').read_text()
    sql(name, migration.rsplit('COMMIT;', 1)[0] + 'SELECT pg_terminate_backend(pg_backend_pid());', expected=2)
    assert sql(name, 'SELECT to_regclass(\'"AgencyCredential"\') IS NULL; SELECT count(*) FROM "Post" WHERE state=\'QUEUE\';').strip().splitlines() == ['t', '5']
    prisma(name, 'resolve', '--applied', '20261013000000_upstream_baseline')
    prisma(name, 'deploy')
    sql(name, assertions)
    prisma(name, 'deploy')  # Applied migration replay is a no-op, preserving rows.
    sql(name, assertions)
    # Persist representative Phase 2 history and prove it survives a real dump/restore.
    sql(name, '''INSERT INTO "AgencyWork" (id,"organizationId","clientId","currentVersion",status,"updatedAt") VALUES ('w','a','a1',1,'APPROVED',now());
INSERT INTO "AgencyRevision" (id,"workId","organizationId","clientId",version,payload,"payloadHash","actorType","actorId") VALUES ('r','w','a','a1',1,'{"timezone":"UTC","targets":[]}','fixture-integrity-hash','user','fixture');
INSERT INTO "AgencyReviewRequest" (id,"workId","revisionId","reviewerId",status,"expiresAt") VALUES ('q','w','r','fixture','APPROVED',now()+interval '1 day');
INSERT INTO "AgencyReviewDecision" (id,"requestId","revisionId","payloadHash","actorId",decision,comment) VALUES ('d','q','r','fixture-integrity-hash','fixture','APPROVED','Synthetic restore evidence');
INSERT INTO "AgencyDispatch" (id,"organizationId","clientId","workId","revisionId","postId","channelId",part,"actorType","actorId",state,"updatedAt") VALUES ('claim','a','a1','w','r','valid','i1',0,'user','fixture','UNKNOWN',now());
''')
    sql(name, 'UPDATE "AgencyRevision" SET "payloadHash"=\'tamper\' WHERE id=\'r\';', expected=3)
    sql(name, 'DELETE FROM "AgencyReviewDecision" WHERE id=\'d\';', expected=3)
    sql(interrupted, (migrations / '20261013000000_upstream_baseline/migration.sql').read_text())
    sql(interrupted, fixture)
    sql(interrupted, (migrations / '20261013010000_client_access/migration.sql').read_text())
    phase2 = (migrations / '20261013020000_immutable_approvals/migration.sql').read_text()
    sql(interrupted, phase2.rsplit('COMMIT;',1)[0]+'SELECT pg_terminate_backend(pg_backend_pid());', expected=2)
    assert sql(interrupted, 'SELECT to_regclass(\'"AgencyRevision"\') IS NULL;').strip() == 't'
    for version in ['20261013000000_upstream_baseline','20261013010000_client_access']: prisma(interrupted,'resolve','--applied',version)
    prisma(interrupted,'deploy'); sql(interrupted,assertions)
    after = command(base + ['pg_dump', '-U', 'postiz_agency', '-d', name, '-Fc'])
    command(base + ['pg_restore', '-U', 'postiz_agency', '-d', restore, '--exit-on-error'], after)
    sql(restore, assertions)
    assert sql(restore, 'SELECT count(*) FROM "AgencyReviewDecision" WHERE id=\'d\'; SELECT state FROM "AgencyDispatch" WHERE id=\'claim\';').strip().splitlines() == ['1','UNKNOWN']
    # Restore the PRE-migration snapshot into an empty disposable database after
    # clearing only this rehearsal's database, then upgrade it again.
    command(base + ['dropdb', '-U', 'postiz_agency', restore]); created.remove(restore)
    command(base + ['createdb', '-U', 'postiz_agency', restore]); created.append(restore)
    command(base + ['pg_restore', '-U', 'postiz_agency', '-d', restore, '--exit-on-error'], before)
    assert sql(restore, 'SELECT count(*) FROM "Post" WHERE state=\'QUEUE\';').strip() == '5'
    prisma(restore, 'resolve', '--applied', '20261013000000_upstream_baseline')
    prisma(restore, 'deploy'); sql(restore, assertions)
    print('PASS: 12 migration/restore gates: immutable revision/decision history, Phase 2 interrupted rollback, revision/decision/UNKNOWN receipt snapshot restore, fresh Prisma deployment, additive install, valid mapping, ambiguity quarantine, paused queues/keys/media, subsystem preservation, interrupted connection rollback, deploy replay, pre/post snapshot restore + re-upgrade.')
finally:
    for db in reversed(created):
        command(base + ['dropdb', '-U', 'postiz_agency', db])
