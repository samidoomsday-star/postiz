'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
type Profile = {
  client: string;
  reviewer: string;
  expiresAt: string;
  csrf: string;
};
type Feedback = {
  id: string;
  revision: number;
  kind: string;
  body: string;
  author: string;
  at: string;
};
type Work = {
  id: string;
  available: boolean;
  message?: string;
  status?: string;
  canDecide?: boolean;
  inFlight?: boolean;
  expiresAt?: string;
  history?: Feedback[];
  revision?: {
    id: string;
    version: number;
    hash: string;
    timezone: string;
    targets: {
      channelId: string;
      accountId: string;
      name: string;
      provider: string;
      publishAt: string;
      settings: Record<string, unknown>;
      parts: {
        id: string;
        message: string;
        delay: number;
        dueAt: string;
        media: { id: string; hash: string; alt: string; mime: string }[];
      }[];
    }[];
  };
};
type Batch = { week: string; page: number; hasMore: boolean; items: Work[] };
const weekStart = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
const names: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  'google-my-business': 'Google Business Profile',
  synthetic: 'Synthetic local provider',
};
export function ReviewPortal({ backendUrl }: { backendUrl: string }) {
  const [profile, setProfile] = useState<Profile | null>(null),
    [token, setToken] = useState(''),
    [challenge, setChallenge] = useState(''),
    [week, setWeek] = useState(weekStart),
    [page, setPage] = useState(0),
    [batch, setBatch] = useState<Batch | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    [bulkComment, setBulkComment] = useState(''),
    [results, setResults] = useState<
      { workId: string; ok: boolean; message?: string }[]
    >([]),
    [unavailable, setUnavailable] = useState(false);
  const initialized = useRef(false),
    operations = useRef(new Map<string, string>());
  const api = useCallback(
    async (path: string, body?: unknown, csrf?: string) => {
      const r = await fetch(backendUrl + '/agency/review/' + path, {
        credentials: 'include',
        cache: 'no-store',
        ...(body === undefined
          ? {}
          : {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(csrf ? { 'x-review-csrf': csrf } : {}),
              },
              body: JSON.stringify(body),
            }),
      });
      const value = await r.json();
      if (!r.ok) {
        if (r.status === 401) setUnavailable(true);
        throw new Error(
          r.status === 409
            ? 'This review changed or is unavailable. Reload before deciding.'
            : typeof value.message === 'string'
            ? value.message
            : 'Review request failed'
        );
      }
      return value;
    },
    [backendUrl]
  );
  const load = useCallback(async () => {
    if (profile) {
      setBatch(await api(`works?week=${week}&page=${page}`));
    }
  }, [profile, api, week, page]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const invitation = params.get('invite') || '';
    window.history.replaceState(null, '', window.location.pathname);
    if (invitation) {
      setToken(invitation);
      setMessage('Verify the email address your agency invited.');
    } else {
      api('session')
        .then((p) => {
          setProfile(p);
          setUnavailable(false);
        })
        .catch(() =>
          setMessage('Open the invitation your agency emailed you to begin.')
        );
    }
  }, [api]);
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, [load]);
  const act = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (profile) await load();
      setUnavailable(false);
      if (success) setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Review request failed');
    } finally {
      setBusy(false);
    }
  };
  const operation = (work: Work, action: string, comment = '') => {
    const key =
      work.id + ':' + work.revision!.version + ':' + action + ':' + comment;
    if (!operations.current.has(key))
      operations.current.set(key, crypto.randomUUID());
    return {
      expectedRevision: work.revision!.version,
      operationId: operations.current.get(key),
      ...(comment ? { comment } : {}),
    };
  };
  const decide = (work: Work, action: 'approve' | 'changes', comment = '') =>
    act(
      () =>
        api(
          `works/${work.id}/${action}`,
          operation(work, action, comment),
          profile!.csrf
        ),
      action === 'approve'
        ? 'Revision approved. Your agency must schedule it separately.'
        : 'Changes requested. Your agency will send a fresh revision.'
    );
  const bulk = (decision: 'APPROVED' | 'CHANGES_REQUESTED') =>
    act(async () => {
      const items = (batch?.items || [])
        .filter((w) => selected.includes(w.id) && w.available && w.canDecide)
        .map((w) => ({
          workId: w.id,
          decision,
          ...operation(
            w,
            decision,
            decision === 'CHANGES_REQUESTED' ? bulkComment : ''
          ),
        }));
      const result = await api('bulk', { items }, profile!.csrf);
      setResults(result.results);
      setSelected([]);
      setMessage('Batch decisions finished. Check each item’s result.');
    });
  const feedback = (work: Work, event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const comment = String(new FormData(form).get('comment') || '');
    void act(async () => {
      await api(
        `works/${work.id}/comments`,
        operation(work, 'comment', comment),
        profile!.csrf
      );
      form.reset();
    }, 'Feedback saved. It does not change the approved content.');
  };
  return (
    <main className="review-shell">
      <header>
        <h1>Client content review</h1>
        {profile && (
          <>
            <p>
              {profile.client} · {profile.reviewer}
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await api('logout', {}, profile.csrf);
                  setProfile(null);
                  setBatch(null);
                  setMessage(
                    'Review session closed. Ask your agency for a new invitation to return.'
                  );
                })
              }
            >
              Close review session
            </button>
          </>
        )}
      </header>
      <p role="status" aria-live="polite" aria-label="Review status">
        {message}
      </p>
      {(!profile || unavailable) && (
        <section aria-label="Verify reviewer email">
          <h2>
            {unavailable ? 'Review access unavailable' : 'Verify your email'}
          </h2>
          <p>
            Use the code sent to the invited email address. Opening a link alone
            cannot approve content.
          </p>
          {token && !challenge && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const value = await api('challenge', { token });
                  setChallenge(value.challengeId);
                  setToken('');
                  setUnavailable(false);
                }, 'A verification code was sent to the invited email address.')
              }
            >
              Send verification code
            </button>
          )}
          {challenge && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = String(
                  new FormData(e.currentTarget).get('code') || ''
                );
                void act(async () => {
                  const p = await api('verify', {
                    challengeId: challenge,
                    code,
                  });
                  setProfile(p);
                  setChallenge('');
                  setUnavailable(false);
                }, 'Email verified. Review the exact revisions below.');
              }}
            >
              <label>
                Email verification code
                <input
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                />
              </label>
              <button disabled={busy}>Verify email</button>
            </form>
          )}
          {!token && !challenge && (
            <p>
              Open a fresh email invitation, or continue an existing verified
              session in this browser.
            </p>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const p = await api('session');
                setProfile(p);
                setUnavailable(false);
                setToken('');
                setChallenge('');
              }, 'Verified review session loaded.')
            }
          >
            Continue current review session
          </button>
        </section>
      )}
      {profile && !unavailable && (
        <>
          <section aria-label="Weekly review batch">
            <h2>Weekly review</h2>
            <label>
              Week begins (UTC)
              <input
                type="date"
                value={week}
                onChange={(e) => {
                  setWeek(e.target.value);
                  setPage(0);
                  setSelected([]);
                }}
              />
            </label>
            <button
              disabled={busy}
              onClick={() => void act(load, 'Review list refreshed.')}
            >
              Reload reviews
            </button>
            <p>
              Each preview shows the exact submitted copy, media and proposed
              time. Networks may display or crop media differently. Approval
              does not publish it.
            </p>
            <div className="review-bulk">
              <label>
                Changes for selected revisions
                <textarea
                  value={bulkComment}
                  onChange={(e) => setBulkComment(e.target.value)}
                  maxLength={4000}
                />
              </label>
              <button
                disabled={busy || !selected.length}
                onClick={() => void bulk('APPROVED')}
              >
                Approve selected revisions
              </button>
              <button
                disabled={busy || !selected.length || !bulkComment.trim()}
                onClick={() => void bulk('CHANGES_REQUESTED')}
              >
                Request changes for selected
              </button>
            </div>
            {results.length > 0 && (
              <ul aria-label="Batch results">
                {results.map((r) => (
                  <li key={r.workId}>
                    {r.ok ? 'Saved' : 'Conflict or unavailable'} · {r.workId}
                    {r.message ? ' · ' + r.message : ''}
                  </li>
                ))}
              </ul>
            )}
            {batch?.items.length === 0 && (
              <p>No current review requests for this week.</p>
            )}
          </section>
          {batch?.items.map((work) => (
            <article
              key={work.id}
              className="review-card"
              data-review-work={work.id}
            >
              {!work.available ? (
                <>
                  <h2>Review unavailable</h2>
                  <p>{work.message}</p>
                </>
              ) : (
                <>
                  <h2>
                    Revision {work.revision!.version} ·{' '}
                    {work.status?.replace(/_/g, ' ')}
                  </h2>
                  {work.canDecide && (
                    <label className="review-check">
                      <input
                        type="checkbox"
                        aria-label={`Select revision ${work.id}`}
                        checked={selected.includes(work.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked
                              ? [...ids, work.id]
                              : ids.filter((id) => id !== work.id)
                          )
                        }
                      />
                      Include this revision in batch decisions
                    </label>
                  )}
                  {work.inFlight && (
                    <p>
                      A publishing mutation has been claimed and may already be
                      in flight. Approval changes cannot undo it.
                    </p>
                  )}
                  {work.revision!.targets.map((t) => (
                    <section
                      key={t.channelId}
                      className="review-target"
                      aria-label={`${t.name} preview`}
                    >
                      <h3>
                        {names[t.provider] || t.provider} · {t.name}
                      </h3>
                      <p>Account: {t.accountId}</p>
                      <p>
                        Proposed time:{' '}
                        <time dateTime={t.publishAt}>
                          {new Date(t.publishAt).toLocaleString('en-GB', {
                            timeZone: work.revision!.timezone,
                          })}{' '}
                          ({work.revision!.timezone})
                        </time>
                      </p>
                      {Object.keys(t.settings).length > 0 && (
                        <details>
                          <summary>Publication options and disclosures</summary>
                          <pre>{JSON.stringify(t.settings, null, 2)}</pre>
                        </details>
                      )}
                      {t.parts.map((part, i) => (
                        <div key={part.id}>
                          <h4>
                            Part {i + 1}
                            {part.delay ? ` · ${part.delay} minute delay` : ''}
                          </h4>
                          <pre className="review-copy">{part.message}</pre>
                          {part.media.map((m) => (
                            <figure key={m.id}>
                              {m.mime.startsWith('image/') ? (
                                <img
                                  src={`${backendUrl}/agency/review/works/${
                                    work.id
                                  }/revisions/${work.revision!.id}/media/${
                                    m.id
                                  }`}
                                  alt={m.alt || 'Proposed media'}
                                />
                              ) : (
                                <video
                                  controls
                                  preload="metadata"
                                  src={`${backendUrl}/agency/review/works/${
                                    work.id
                                  }/revisions/${work.revision!.id}/media/${
                                    m.id
                                  }`}
                                />
                              )}
                              {m.alt && <figcaption>{m.alt}</figcaption>}
                            </figure>
                          ))}
                        </div>
                      ))}
                    </section>
                  ))}
                  {work.canDecide && (
                    <div className="review-decisions">
                      <button
                        disabled={busy}
                        onClick={() => void decide(work, 'approve')}
                      >
                        Approve this revision
                      </button>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const comment = String(
                            new FormData(e.currentTarget).get('comment') || ''
                          );
                          void decide(work, 'changes', comment);
                        }}
                      >
                        <label>
                          Requested changes
                          <textarea name="comment" maxLength={4000} required />
                        </label>
                        <button disabled={busy}>Request changes</button>
                      </form>
                    </div>
                  )}
                  <section aria-label="Review feedback">
                    <h3>Feedback history</h3>
                    <ul>
                      {work.history?.map((h) => (
                        <li key={h.id}>
                          <strong>
                            {h.author} · revision {h.revision} ·{' '}
                            {h.kind.replace(/_/g, ' ')}
                          </strong>
                          <p>{h.body}</p>
                        </li>
                      ))}
                    </ul>
                    <form onSubmit={(e) => feedback(work, e)}>
                      <label>
                        Feedback (visible to your agency)
                        <textarea name="comment" maxLength={4000} required />
                      </label>
                      <button disabled={busy}>Add feedback</button>
                    </form>
                  </section>
                </>
              )}
            </article>
          ))}
          <nav aria-label="Review pages">
            <button
              disabled={busy || page === 0}
              onClick={() => {
                setPage((p) => p - 1);
                setSelected([]);
              }}
            >
              Previous page
            </button>
            <span>Page {page + 1}</span>
            <button
              disabled={busy || !batch?.hasMore}
              onClick={() => {
                setPage((p) => p + 1);
                setSelected([]);
              }}
            >
              Next page
            </button>
          </nav>
        </>
      )}
    </main>
  );
}
