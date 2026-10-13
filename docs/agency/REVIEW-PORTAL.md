# Client review workflow

Phase 3 adds `/review` for invited clients. Agency staff continue to use `/agency` and the retained editor/calendar. The dashboard and publishing recovery controls remain Phase 4 work. Live email delivery and social-platform compatibility are separate from the verified local synthetic workflow.

## Agency and reviewer journey

1. An agency administrator chooses a client, reviewer name/email and all or selected client channels, then sends an invitation. The administrator receives delivery status, not the invitation secret. In synthetic mode use a `.test` address and read the invitation in the local Mailpit sink.
2. An editor saves an immutable draft, chooses that invited reviewer and requests review. Submission can happen before email verification; no client session exists until verification succeeds.
3. The reviewer opens the emailed link and requests a separate code sent to the invited mailbox. The page removes the invitation fragment from the address bar. Entering the code in that browser establishes a client/channel-bound review session.
4. The weekly list shows the exact final per-channel copy, ordered media/alt text, channel/account identity, publication options and proposed time/timezone. The week range uses UTC and defaults to Monday. Reviewers can select another seven-day start and navigate pages of 20 items.
5. The reviewer approves each revision or requests changes with feedback. Batch decisions report success/conflict per item. Approval requires the exact current revision and does not enqueue publication.
6. After changes, the editor opens the same work, reads client-visible feedback, saves a new revision and requests review again. Old review requests become superseded. The reviewer reloads, verifies the fresh version and approves it.
7. A publisher schedules the approved revision through the normal agency card/calendar flow. Proposed-time changes require another revision and approval. Existing dispatch claims retain Phase 2's in-flight and no-blind-retry rules.

Standalone feedback is explicitly visible to the agency/client. It is append-only and nonmaterial: adding feedback does not change the frozen payload or approval. Earlier permitted decisions/comments remain in the feedback history. Legacy internal notes and organization-wide comment routes are not projected.

If an invitation was already exchanged, its link cannot create another session. `/review` without the fragment, or “Continue current review session,” can resume that browser's still-valid session. After expiry or session closure, ask the agency for a fresh invitation. Renewal closes the old invitation/session; it cannot revive an approval bound to the old invitation. Staff must obtain a fresh reviewed revision for that approval.

## Identity and permission design

An invitation references an existing LOCAL user by canonical email, or creates a passwordless LOCAL reviewer identity and a USER membership. It never creates editor/publisher/admin grants or changes existing staff grants. Passwordless invited users cannot sign in through ordinary password login. The invitation is a separate review-only permission source; its cookie cannot authenticate the agency API, public API or MCP.

Only server-created actor context carries review-session/invitation references. Session decisions recheck those records inside the shared Phase 2 policy transaction. External decisions retain `reviewInvitationId`, so dispatch checks the original invitation, verified email binding, issuer's current administrator membership, reviewer membership, client/channel scope and expiry. A later invitation cannot make an old approval eligible again. Ordinary staff decisions still require their explicit staff reviewer grant.

Invitations last at most seven days. One exchange creates at most one session, which lasts at most 24 hours and never beyond invitation expiry. Closing/expiring a session removes interactive access; invitation revocation removes its permission and bound approval eligibility. A publishing mutation that already won its claim may finish; revocation cannot promise remote removal. Independent staff permissions are not changed by invitation revocation.

## Verification and browser protections

- Link secrets and session secrets use 32 random bytes; only SHA-256 hashes are stored. The invitation secret travels in an email URL fragment, not a server query string.
- A ten-minute challenge stores an HMAC of the six-digit code and a hash of a separate browser nonce. The nonce is an HttpOnly cookie. Forwarding a link/challenge without mailbox and browser proof cannot exchange it.
- Five wrong code attempts consume the challenge. Challenge issuance is limited to three per invitation per 15 minutes and 80 per socket peer per 15 minutes. Verification has a 100-per-peer limit; decisions and comments have 120/60-per-session limits. Quotas are atomic database records and do not trust caller-supplied forwarding headers. Bulk decisions count each item.
- Session cookies are HttpOnly, SameSite Strict, scoped to `/agency/review`, and Secure with an HTTPS backend. Mutation routes require the exact configured frontend Origin and a session-bound CSRF token, except the challenge/exchange steps which require Origin plus browser/email proof. Explicit automation/auth headers do not replace a review session.
- Portal responses/media are private/no-store, no-referrer and nosniff. The portal disallows framing. Its separate Next root layout loads no application analytics/session-replay scripts. Backend review requests are excluded from Sentry events/traces, including case variants.
- Sensitive emails use the existing transport directly. They never enter Temporal histories, email-service console output, audit metadata or public API projections. Delivery failure is a 503 and the issued invitation is revoked; no fake verification fallback exists.

The local sink is a synthetic demonstration mailbox; real production invitation delivery requires authorized, configured email transport. Test mode rejects non-`.test` recipients and nonlocal review SMTP destinations.

## API contract

Agency operations use the normal current staff actor:

| `/agency` method/path | Purpose |
| --- | --- |
| POST `review-invitations` | Admin issues/replaces a client/channel-bound invitation; sends email. |
| GET `clients/:id/review-invitations` | Own-agency admin list, bounded to 100; never returns token/session/code hashes. |
| POST `review-invitations/:id/revoke` | Revoke the invitation and its sessions. |
| GET `works/:id/review-comments` | Current scoped staff feedback history. |
| POST `works/:id/review-comments` | Human editor adds client-visible, append-only feedback with expected version/operation ID. |

Portal operations use `/agency/review`:

| Method/path | Purpose |
| --- | --- |
| POST `challenge` | One-time invitation token requests a code at the bound email; returns challenge ID/expiry and sets browser-nonce cookie. |
| POST `verify` | Challenge ID/code plus that cookie exchange once for a narrow session. |
| GET `session` | Minimal client/reviewer/session-expiry profile and CSRF token. |
| POST `logout` | Close the current narrow session. |
| GET `works?week=YYYY-MM-DD&page=N` | Current assigned requests, filtered by agency/client/channel/assignment/week before pagination. |
| GET `works/:id` | Exact current review projection, or an unavailable notice for a formerly assigned stale item; never a new unsubmitted draft. |
| POST `works/:id/approve`, `works/:id/changes` | Phase 2 decision with expectedRevision/operationId; changes require a comment. |
| POST `bulk` | Up to 30 distinct per-item decisions; independent stable outcomes/conflicts. |
| POST `works/:id/comments` | Nonmaterial public feedback, up to 4,000 characters. |
| GET `works/:id/revisions/:revisionId/media/:snapshotId` | Current authorized frozen media, including private byte ranges. |

Decisions/comments use current expected revision and actor-scoped command IDs. A stale version returns 409; inaccessible resources are non-enumerating 404; missing/expired review identity is 401; Origin/CSRF/automation denial is 403; exhausted issuance quotas return 429. Superseded/canceled/expired/channel-unavailable/original-invitation-invalid items cannot be decided. Bulk results do not silently approve a replacement version.

## Preview and staged limits

These are readable previews of the frozen publication payload, not network-native renderers. Social platforms can change layout, crop media and apply their own processing. Registered provider publication/disclosure fields are projected; unknown/internal/secret fields and synthetic implementation settings are omitted. Media bytes/alt/order and final messages come from the immutable revision. No channel access tokens, original private upload paths, internal notes, raw pending provider data or other clients are exposed.

The supported media profile remains private local storage. There is no new brand system, custom domain, autosave project, analytics report, inbox or email automation platform. The internal editor's advanced provider/multipart API limits from Phase 2 still apply. Provider contracts/performance/hardening are Phase 5; independent-clone release verification is Phase 6.
