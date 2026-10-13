# Phase 3 findings and fixes

All cases use local synthetic users/messages. Final executed results are in [phase-3.md](../phase-3.md).

| ID / severity | Expected/actual and root cause | Fix and regression |
| --- | --- | --- |
| P3-001 / 2 | New portal formatting used replaceAll outside the inherited TypeScript library target; frontend build failed. | Use equivalent regex replacement; retain type/build gates and existing compiler targets. |
| P3-002 / 2 | Invited passwordless identities could reach bcrypt comparison with a null password and return an implementation error. | Explicitly reject passwordless ordinary login; API proves 400 and no staff authentication, while verified narrow access succeeds. |
| P3-003 / 1 | Arbitrary stored provider options could include unknown/private fields in a client preview. | Restrict to registered publication DTO fields, remove private nested fields, omit synthetic implementation options. Whitelist regression plus private minimal projection tests. |
| P3-004 / 2 | Renewal invalidated old access, but an old invitation-bound approval could still appear available to the renewed session. | Projection rechecks the original decision invitation; renewal regression requires unavailable projection, old-session denial and no resurrected schedule/approval. |
| P3-005 / 2 | Channel refresh could reset unsaved composer text; client switching briefly retained the previous channel selection. | Clear data on actual client switches and preserve same-client draft state across unrelated refreshes. Both full browser journeys prove unsaved composer text survives requesting another work's review. |

Harness correction: the initial browser locator omitted “channel” from the synthetic fixture label. It now checks the actual named channel; no denial or workflow assertion was weakened. Initial failed builds/runs are recorded as failures, not acceptance evidence. No workflow-version or dependency pin changes were needed.

The initial full 67-test run passed 66 and failed the mobile keyboard harness: it focused Approve while Reload was still disabling controls, so Enter did not reach Approve. The harness now waits for enabled and focused controls before keyboard actions; both desktop and mobile targeted flows passed again. Decision and schedule assertions remain unchanged. See the final full regression evidence in the phase report.

P3-006 / severity 2: immediate owned restart initially failed the frontend bind probe after shutdown. Recently closed HTTP connections can retain TIME_WAIT; the probe now uses SO_REUSEADDR like the server. A live unrelated-listener check still refuses binding; actual approved-queue restart is rerun. No process ownership or signaling checks were weakened.
