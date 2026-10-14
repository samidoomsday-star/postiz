import { test, expect } from '@playwright/test';
import { api, command } from './approval.helpers';
import { db, fixture, save, cleanupActionFixtures } from './action.helpers';
test.afterEach(cleanupActionFixtures);
test.afterAll(() => db.$disconnect());
test('T05-06: cookie staff commands need trusted origin; hostile origins cannot use explicit staff headers either', async ({
  request,
  playwright,
}) => {
  const f = await fixture(),
    w = await save(request, f, [{}], 600000);
  const cookie = await playwright.request.newContext({
    storageState: {
      cookies: [
        {
          name: 'auth',
          value: w.headers.auth,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'None',
          expires: -1,
        },
        {
          name: 'showorg',
          value: 'fixture-agency-a',
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'None',
          expires: -1,
        },
      ],
      origins: [],
    },
  });
  try {
    for (const origin of [undefined, 'https://hostile.example.test']) {
      const r = await cookie.post(`${api}/agency/works/${w.workId}/cancel`, {
        headers: origin ? { origin } : {},
        data: command(),
      });
      expect(r.status()).toBe(403);
    }
    expect(
      (
        await request.post(`${api}/agency/works/${w.workId}/cancel`, {
          headers: { ...w.headers, origin: 'https://hostile.example.test' },
          data: command(),
        })
      ).status()
    ).toBe(403);
    expect(
      (await db.agencyWork.findUniqueOrThrow({ where: { id: w.workId } }))
        .status
    ).toBe('APPROVED');
    expect(
      (
        await cookie.post(`${api}/agency/works/${w.workId}/cancel`, {
          headers: { origin: 'http://localhost:4200' },
          data: command(),
        })
      ).status()
    ).toBe(201);
  } finally {
    await cookie.dispose();
  }
});
test('T05-01: bulk dashboard read scope matches per-resource policy after channel-restricted grant revocation', async ({
  request,
}) => {
  const f = await fixture(true),
    w = await save(request, f, [{}], 600000);
  const login = await request.post(api + '/auth/login', {
    data: {
      provider: 'LOCAL',
      email: 'editor-a@example.test',
      password: 'LocalFixture123!',
    },
  });
  const headers = { auth: login.headers().auth, showorg: 'fixture-agency-a' };
  const grant = await db.agencyGrant.findFirstOrThrow({
    where: {
      clientId: f.client.id,
      userId: 'fixture-user-a-editor',
      role: 'EDITOR',
    },
  });
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { channelIds: [f.channels[1].id] },
  });
  const scoped = await request.get(
    `${api}/agency/actions?client=${f.client.id}`,
    { headers }
  );
  expect(scoped.status()).toBe(200);
  expect((await scoped.json()).count).toBe(0);
  await db.agencyGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() },
  });
  expect(
    (
      await request.get(`${api}/agency/actions?client=${f.client.id}`, {
        headers,
      })
    ).status()
  ).toBe(404);
  expect(
    (
      await request.get(`${api}/agency/actions/${w.revisionId}`, { headers })
    ).status()
  ).toBe(404);
});

test('T05-02: same-attempt completion after a confirmed reconciliation is idempotent; late failure cannot audit false uncertainty', async ({
  request,
}) => {
  const { scheduled, receipt, closed, mutations } = await import(
    './action.helpers'
  );
  const f = await fixture(),
    w = await scheduled(request, f);
  const row = await receipt(w.postId, 'CONFIRMED');
  await closed(w.postId);
  // Run the real compiled service with PostgreSQL; no policy/service fake.
  const { execFileSync } = await import('node:child_process');
  execFileSync(
    process.execPath,
    [
      '--experimental-require-module',
      '--input-type=module',
      '-e',
      `
  import {createRequire} from 'node:module';import {PrismaClient} from '@prisma/client';
  const require=createRequire(import.meta.url),{ApprovalService}=require('./apps/backend/dist/libraries/nestjs-libraries/src/agency/approval.service.js'),{AgencyService}=require('./apps/backend/dist/libraries/nestjs-libraries/src/agency/agency.service.js');
  const db=new PrismaClient();try {
   const row=await db.agencyDispatch.findUniqueOrThrow({where:{id:${JSON.stringify(
     row.id
   )}}});
   const integration=await db.integration.findUniqueOrThrow({where:{id:row.channelId}}), revision=await db.agencyRevision.findUniqueOrThrow({where:{id:row.revisionId}});
   const claim={rows:[row],integration,target:revision.payload.targets[0]};
   const service=new ApprovalService(db,new AgencyService(db),null,null,null);
   await service.finish(claim,[{id:row.postId,postId:row.providerId,releaseURL:row.providerUrl,status:'published'}]);
   const audits=await db.agencyAudit.count({where:{resourceId:row.id,action:'dispatch.unknown'}});
   await service.failed(claim,false);
   if(await db.agencyAudit.count({where:{resourceId:row.id,action:'dispatch.unknown'}})!==audits)throw Error('False unknown audit');
   let staleDenied=false;try{await service.finish({...claim,rows:[{...row,attempt:-1}]},[{id:row.postId,postId:row.providerId,releaseURL:row.providerUrl,status:'published'}]);}catch{staleDenied=true;}if(!staleDenied)throw Error('Stale receipt write accepted');
  } finally {await db.$disconnect();}process.exit(0);
 `,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 }
  );
  expect(
    (await db.agencyDispatch.findUniqueOrThrow({ where: { id: row.id } })).state
  ).toBe('CONFIRMED');
  expect(mutations(w.postId)).toHaveLength(1);
});

test('T05-02/T05-04: a terminal rejection after an accepted side effect stays unknown until read-only evidence confirms it', async ({request})=>{
 const {scheduled,receipt,closed,mutations,detail}=await import('./action.helpers');
 const f=await fixture(),w=await scheduled(request,f,[{outcome:'rejection-after-accept'}]);
 const row=await receipt(w.postId,'UNKNOWN');await closed(w.postId);
 expect(mutations(w.postId)).toHaveLength(1);
 const view=await detail(request,w);expect(view.state).toBe('UNKNOWN');expect(view.receipts[0].canRetry).toBe(false);
 const data={...command(),dispatchId:row.id,expectedAttempt:0};
 expect((await request.post(`${api}/agency/actions/${w.revisionId}/retry`,{headers:w.headers,data})).status()).toBe(409);
 expect((await request.post(`${api}/agency/actions/${w.revisionId}/reconcile`,{headers:w.headers,data:{...data,...command()}})).status()).toBe(201);
 await receipt(w.postId,'CONFIRMED');expect(mutations(w.postId)).toHaveLength(1);
});
