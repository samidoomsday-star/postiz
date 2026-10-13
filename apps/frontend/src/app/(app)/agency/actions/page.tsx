'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import '../agency.css';

type Summary = {
  id: string;
  workId: string;
  clientId: string;
  clientName: string;
  version: number;
  state: string;
  status: string;
  urgency: string;
  reason: string;
  timezone: string;
  scheduledAt: string;
  lastUpdate: string;
  ownerId: string | null;
  disposition: string;
  actionVersion: number;
  note: string;
  confirmed: number;
  total: number;
  unknown: boolean;
  failed: boolean;
  blocked: boolean;
};
type Receipt = {
  id: string;
  channelName: string;
  channelId: string;
  part: number;
  stage: string;
  state: string;
  meaning: string;
  attempt: number;
  updatedAt: string;
  providerId: string | null;
  providerUrl: string | null;
  reason: string | null;
  canRetry: boolean;
  canResume: boolean;
  canReconcile: boolean;
  manualResolution: string | null;
};
type Detail = Summary & {
  current: boolean;
  revision: {
    id: string;
    version: number;
    hash: string;
    timezone: string;
    targets: {
      channelId: string;
      name: string;
      provider: string;
      accountId: string;
      publishAt: string;
      parts: { id: string; message: string; dueAt: string }[];
    }[];
  };
  receipts: Receipt[];
  owners: { id: string; name: string }[];
  permitted: { edit: boolean; publish: boolean };
  audits: { id: string; action: string; createdAt: string }[];
  evidence: {
    id: string;
    kind: string;
    outcome: string;
    attempt: number;
    previousState: string;
    createdAt: string;
  }[];
  manualGuide: string;
};
const states = [
  'SAVED',
  'REVIEW_PENDING',
  'CHANGES_REQUESTED',
  'APPROVAL_INVALIDATED',
  'CHANNEL_BLOCKED',
  'DUE_STALLED',
  'SCHEDULED',
  'PROCESSING',
  'PUBLISHED',
  'FAILED',
  'UNKNOWN',
  'PARTIAL',
  'CANCELED',
  'SUPERSEDED',
];
const label = (value: string) => value.toLowerCase().replace(/_/g, ' ');
const time = (value: string, zone = 'UTC') =>
  new Date(value).toLocaleString('en', { timeZone: zone });
export default function AgencyActionsPage() {
  const fetchApi = useFetch();
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]),
    [client, setClient] = useState(''),
    [owner, setOwner] = useState(''),
    [state, setState] = useState(''),
    [urgency, setUrgency] = useState(''),
    [page, setPage] = useState(0);
  const [items, setItems] = useState<Summary[]>([]),
    [count, setCount] = useState(0),
    [more, setMore] = useState(false),
    [detail, setDetail] = useState<Detail | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [message, setMessage] = useState(''),
    [refresh, setRefresh] = useState(0);
  const [assignee, setAssignee] = useState(''),
    [disposition, setDisposition] = useState('OPEN'),
    [note, setNote] = useState('');
  const operationIds = useRef(new Map<string, string>()),
    detailSeq = useRef(0);
  const request = useCallback(
    async (path: string, body?: unknown) => {
      const response = await fetchApi(
        '/agency/' + path,
        body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }
      );
      if (!response) throw new Error('Sign in required');
      const value = await response.json();
      if (!response.ok)
        throw new Error(
          Array.isArray(value.message)
            ? value.message.join(', ')
            : value.message || 'Request failed'
        );
      return value;
    },
    [fetchApi]
  );
  const choose = useCallback(
    async (id: string) => {
      const seq = ++detailSeq.current;
      setDetail(null);
      try {
        const value = await request('actions/' + id);
        if (seq !== detailSeq.current) return;
        setDetail(value);
        setAssignee(value.ownerId || '');
        setDisposition(value.disposition);
        setNote(value.note);
      } catch (e) {
        if (seq === detailSeq.current) setMessage((e as Error).message);
      }
    },
    [request]
  );
  useEffect(() => {
    request('self')
      .then((v) => setClients(v.clients))
      .catch((e) => setMessage(e.message));
    const id = new URLSearchParams(window.location.search).get('revision');
    if (id) choose(id);
  }, [request, choose]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    const query = new URLSearchParams({
      page: String(page),
      ...(client ? { client } : {}),
      ...(owner ? { owner } : {}),
      ...(state ? { state } : {}),
      ...(urgency ? { urgency } : {}),
    });
    request('actions?' + query)
      .then((v) => {
        if (active) {
          setItems(v.items);
          setCount(v.count);
          setMore(v.hasMore);
        }
      })
      .catch((e) => {
        if (active) setMessage(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, client, owner, state, urgency, page, refresh]);
  const command = async (
    action: string,
    receipt?: Receipt,
    extra: Record<string, unknown> = {}
  ) => {
    if (!detail || busy) return;
    setBusy(true);
    const payload = {
      expectedRevision: detail.version,
      ...(receipt
        ? { dispatchId: receipt.id, expectedAttempt: receipt.attempt }
        : {}),
      ...extra,
    };
    const key = JSON.stringify({ id: detail.id, action, payload });
    if (!operationIds.current.has(key))
      operationIds.current.set(key, crypto.randomUUID());
    try {
      const value = await request(
        action === 'cancel'
          ? `works/${detail.workId}/cancel`
          : `actions/${detail.id}/${action}`,
        { ...payload, operationId: operationIds.current.get(key) }
      );
      setMessage(
        action === 'update'
          ? 'Operator record saved. Publication receipts are unchanged.'
          : value.outcome === 'QUEUED'
          ? 'Queued only; publication still needs a confirmed receipt.'
          : value.outcome
          ? 'Receipt check: ' + label(value.outcome) + '. No resend performed.'
          : 'Queue canceled; claimed publications may still finish.'
      );
      // Reconciliation is read-only: a later deliberate check needs a fresh
      // operation, while duplicate in-flight clicks still share one ID.
      if (action === 'reconcile') operationIds.current.delete(key);
      await choose(detail.id);
      setRefresh((v) => v + 1);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    command('update', undefined, {
      expectedActionVersion: detail!.actionVersion,
      ownerId: assignee || null,
      disposition,
      note,
    });
  };
  return (
    <main className="agency-access agency-actions">
      <header>
        <div>
          <p className="eyebrow">Postiz agency edition</p>
          <h1>Agency action dashboard</h1>
          <p>
            Resolve blocked work using exact revisions and factual receipts.
          </p>
        </div>
        <a href="/agency">Client workspace</a>
      </header>
      <p role="status" aria-label="Action status" aria-live="polite">
        {message}
      </p>
      <section aria-label="Action filters">
        <h2>Action queue</h2>
        <div className="action-filters">
          <label>
            Client filter
            <select
              aria-label="Client filter"
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All permitted clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Owner filter
            <select
              aria-label="Owner filter"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All owners</option>
              <option value="me">Assigned to me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label>
            State filter
            <select
              aria-label="State filter"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All outcomes</option>
              {states.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Urgency filter
            <select
              aria-label="Urgency filter"
              value={urgency}
              onChange={(e) => {
                setUrgency(e.target.value);
                setPage(0);
              }}
            >
              <option value="">All urgencies</option>
              {['HIGH', 'NORMAL', 'LOW'].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          disabled={busy || loading}
          onClick={() => setRefresh((v) => v + 1)}
        >
          Refresh action queue
        </button>
        <p>
          {loading
            ? 'Loading…'
            : `${count} matching revisions · Page ${page + 1}`}
        </p>
        <ul aria-label="Agency actions">
          {items.map((item) => (
            <li key={item.id} data-action-id={item.id}>
              <h3>
                {item.clientName} · Revision {item.version} ·{' '}
                {label(item.state)}
              </h3>
              <p>{item.reason}</p>
              <p>
                Urgency: {label(item.urgency)} · {item.confirmed}/{item.total}{' '}
                confirmed parts · Operator: {label(item.disposition)}
              </p>
              <p>
                Proposed: {time(item.scheduledAt, item.timezone)} (
                {item.timezone}) · Updated: {time(item.lastUpdate)}
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => choose(item.id)}
              >
                Inspect revision {item.version}
              </button>
            </li>
          ))}
        </ul>
        {!loading && !items.length && (
          <p>No matching work in your current access scope.</p>
        )}
        <nav aria-label="Action pages">
          <button
            type="button"
            disabled={busy || loading || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous page
          </button>
          <button
            type="button"
            disabled={busy || loading || !more}
            onClick={() => setPage((p) => p + 1)}
          >
            Next page
          </button>
        </nav>
      </section>
      {detail && (
        <section aria-label="Action detail" data-action-detail={detail.id}>
          <h2>
            Revision {detail.version}: {label(detail.state)}
          </h2>
          <p>
            {detail.clientName} · {detail.reason}
          </p>
          <p>
            {detail.current
              ? 'Current revision'
              : 'Historical revision; publishing again is blocked.'}{' '}
            · Operator: {label(detail.disposition)}
          </p>
          <p>
            Revision hash: <code>{detail.revision.hash}</code>
          </p>
          {detail.current && (
            <a
              href={`/agency?client=${encodeURIComponent(
                detail.clientId
              )}#work-${detail.workId}`}
            >
              Open revision in client workspace
            </a>
          )}
          {detail.revision.targets.map((t) => (
            <article key={t.channelId}>
              <h3>
                {t.name} · {t.provider}
              </h3>
              <p>
                Account: {t.accountId} ·{' '}
                {time(t.publishAt, detail.revision.timezone)} (
                {detail.revision.timezone})
              </p>
              {t.parts.map((p, i) => (
                <div key={p.id}>
                  <p>
                    Part {i + 1} · due {time(p.dueAt, detail.revision.timezone)}
                  </p>
                  <pre>{p.message}</pre>
                </div>
              ))}
            </article>
          ))}
          <h3>Per-target receipts</h3>
          <p>
            Confirmed results are retained. Failed, processing and unknown
            outcomes stay distinct.
          </p>
          <ul aria-label="Publication receipts">
            {detail.receipts.map((r) => (
              <li key={r.id} data-dispatch-id={r.id}>
                <h4>
                  {r.channelName} · Part {r.part + 1} · {r.stage}
                </h4>
                <p>
                  {r.meaning} · Attempt {r.attempt} · Updated{' '}
                  {time(r.updatedAt)}
                </p>
                {r.reason && <p>{r.reason}</p>}
                {r.providerId && <p>Provider receipt: {r.providerId}</p>}
                {r.providerUrl && (
                  <a href={r.providerUrl} target="_blank" rel="noreferrer">
                    View confirmed publication
                  </a>
                )}
                {r.canRetry && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => command('retry', r)}
                  >
                    Retry known-safe failed target
                  </button>
                )}
                {r.canReconcile && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => command('reconcile', r)}
                  >
                    Check existing receipt
                  </button>
                )}
                {r.canResume && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => command('resume', r)}
                  >
                    Resume unclaimed target
                  </button>
                )}
                {r.manualResolution && <p>{r.manualResolution}</p>}
              </li>
            ))}
          </ul>
          <p>{detail.manualGuide}</p>
          <p>
            For overdue unclaimed work, check the worker and restore its
            connection. An HTTP health response alone does not prove polling.
          </p>
          {detail.current &&
            detail.permitted.publish &&
            detail.status === 'SCHEDULED' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => command('cancel')}
              >
                Cancel unclaimed remainder
              </button>
            )}
          <form aria-label="Operator record" onSubmit={save}>
            <h3>Assignment and acknowledgment</h3>
            <label>
              Action owner
              <select
                aria-label="Action owner"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">Unassigned</option>
                {detail.owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator disposition
              <select
                aria-label="Operator disposition"
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
              >
                {['OPEN', 'ACKNOWLEDGED', 'DISMISSED'].map((s) => (
                  <option key={s} value={s}>
                    {label(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Operator investigation note
              <textarea
                value={note}
                maxLength={2000}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p>
              Notes are visible to authorized agency staff. Dismissal needs a
              reason and never changes the actual publication result.
            </p>
            <button disabled={busy} type="submit">
              Save operator record
            </button>
          </form>
          <h3>Recovery evidence</h3>
          <ul aria-label="Recovery evidence">
            {detail.evidence.map((e) => (
              <li key={e.id}>
                {e.kind} · {e.outcome} · previous {e.previousState} · attempt{' '}
                {e.attempt} · {time(e.createdAt)}
              </li>
            ))}
          </ul>
          <h3>Audit history</h3>
          <ul aria-label="Action audit history">
            {detail.audits.map((a) => (
              <li key={a.id}>
                {a.action} · {time(a.createdAt)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
