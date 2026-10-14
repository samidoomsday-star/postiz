# Agency V1 release candidate 1

Documentation label `agency-v1.0.0-rc.1`; branch `release/agency-v1-rc1`. This is a local synthetic release candidate for owner acceptance, independently maintained from Postiz v2.25.1. It is not an official Postiz release. Exact candidate identity and executed checks are in [Phase 6 evidence](evidence/phase-6.md).

V1 adds agency/client/channel permissions and scoped credentials, immutable revision approvals enforced at worker dispatch, verified client review with weekly previews/feedback, and a scoped action dashboard with truthful target receipts and bounded recovery. It retains the editor/calendar within that boundary. Material changes require another review; uncertain outcomes cannot be blindly retried.

All phase changes are assembled on the candidate branch; earlier draft PRs remain unmerged. Phase 6 adds installation preflight, separate Compose volumes for fresh checkouts, a full local verification command and [tester instructions](LOCAL-TESTING.md). The synthetic profile builds this source with pinned tools/images and requires no social credentials.

The upstream baseline remains frozen at `91c91f633a0175fb3914dba64c932928c514b72a`. Phase 5's documented targeted dependency fixes are included; no automatic upstream update or schema/workflow redesign is introduced here. V2 remains deferred. Read [known issues](KNOWN-ISSUES.md), [source/license notice](SOURCE-NOTICE.md), [platform matrix](platform-matrix.csv) and the completed release checklist before acceptance.
