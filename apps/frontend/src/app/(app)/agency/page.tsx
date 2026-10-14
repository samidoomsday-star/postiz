'use client';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import './agency.css';
import { ReviewInvitations } from './review.invites';
import { RevisionWorkspace } from './revision.workspace';

type Client = { id: string; name: string };
type Channel = {
  id: string;
  name: string;
  providerIdentifier: string;
  customerId: string | null;
  ownershipQuarantined: boolean;
};
type Work = {
  id: string;
  content: string;
  state: string;
  integrationId: string;
};
type Management = {
  members: {
    userId: string;
    role: string;
    disabled: boolean;
    user: { email: string };
  }[];
  grants: {
    id: string;
    userId: string;
    clientId: string;
    role: string;
    revokedAt: string | null;
  }[];
  channels: Channel[];
  credentials: {
    id: string;
    name: string;
    prefix: string;
    clientIds: string[];
    actions: string[];
    expiresAt: string;
    revokedAt: string | null;
  }[];
  audits: {
    id: string;
    action: string;
    resourceId: string;
    createdAt: string;
  }[];
  quarantinedMedia: { id: string; name: string }[];
  quarantinedPosts: { id: string; group: string }[];
};
export default function AgencyAccessPage() {
  const fetchApi = useFetch();
  const [clients, setClients] = useState<Client[]>([]);
  const [client, setClient] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [work, setWork] = useState<Work[]>([]);
  const [admin, setAdmin] = useState(false);
  const [management, setManagement] = useState<Management | null>(null);
  const [message, setMessage] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [revisionRefresh, setRevisionRefresh] = useState(0);
  const request = useCallback(
    async (path: string, body?: unknown) => {
      const response = await fetchApi('/agency/' + path, {
        ...(body !== undefined
          ? { method: 'POST', body: JSON.stringify(body) }
          : {}),
      });
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
  const reload = useCallback(async () => {
    const self = await request('self');
    setClients(self.clients);
    setAdmin(self.admin);
    const requestedClient = new URLSearchParams(window.location.search).get('client');
    setClient((current) =>
      requestedClient && self.clients.some((c: Client) => c.id === requestedClient) ? requestedClient :
      self.clients.some((c: Client) => c.id === current)
        ? current
        : self.clients[0]?.id || ''
    );
    if (self.admin) setManagement(await request('management'));
  }, [request]);
  const refreshWork = useCallback(async () => {
    if (!client) {
      setChannels([]);
      setWork([]);
      return;
    }
    const [channels, posts] = await Promise.all([
      request(`clients/${client}/channels`),
      request(`clients/${client}/posts`),
    ]);
    setChannels(channels);
    setWork(posts.items);
  }, [request, client]);
  useEffect(() => {
    reload().catch((e) => setMessage(e.message));
  }, [reload]);
  useEffect(() => {
    refreshWork().catch((e) => {
      setChannels([]);
      setWork([]);
      setMessage(e.message);
    });
  }, [refreshWork]);
  const mutate = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setMessage('');
    try {
      await action();
      await reload();
      await refreshWork();
      setMessage('Saved. Current access is applied immediately.');
      setRevisionRefresh(n => n + 1);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  };
  const data = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return new FormData(event.currentTarget);
  };
  const clientSelect = (name = 'clientId') => (
    <label>
      Client
      <select name={name} required>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <main className="agency-access">
      <header>
        <div>
          <p className="eyebrow">Postiz agency edition</p>
          <h1>Client workspace</h1>
          <p>Prepare content with explicit client access.</p>
        </div>
        <nav><a href="/agency/actions">Action dashboard</a><a href="/auth/logout">Sign out</a></nav>
      </header>
      <p role="status" aria-label="Workspace status" aria-live="polite">
        {message}
      </p>
      <section aria-labelledby="content-heading">
        <h2 id="content-heading">Client content</h2>
        <label>
          Active client
          <select
            aria-label="Active client"
            value={client}
            onChange={(e) => { setChannels([]); setWork([]); setClient(e.target.value); }}
          >
            <option value="">Choose client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {!clients.length && (
          <p>
            No client content access assigned. Ask your agency administrator for
            a grant.
          </p>
        )}
        <ul aria-label="Client channels">
          {channels.map((c) => (
            <li key={c.id}>{c.name}</li>
          ))}
        </ul>
        <RevisionWorkspace key={client} client={client} channels={channels} request={request} refresh={revisionRefresh} onError={setMessage} onSaved={async () => { await refreshWork(); setMessage('Saved. Current access is applied immediately.'); }} />
        <ul aria-label="Client posts">
          {work.map((p) => (
            <li key={p.id}>
              <strong>{p.state}</strong>
              <p>{p.content.replace(/<[^>]*>/g, '')}</p>
            </li>
          ))}
        </ul>
      </section>
      {admin && client && <ReviewInvitations client={client} channels={channels} request={request} onMessage={setMessage} onChanged={async () => { await reload(); setRevisionRefresh(n => n + 1); }} />}
      {admin && management && (
        <>
          <section aria-labelledby="access-heading">
            <h2 id="access-heading">Client access</h2>
            <form
              onSubmit={(e) => {
                const f = data(e);
                void mutate(() => request('clients', { name: f.get('name') }));
              }}
            >
              <label>
                New client name
                <input name="name" required maxLength={100} />
              </label>
              <button disabled={busy}>Add client</button>
            </form>
            <form
              onSubmit={(e) => {
                const f = data(e);
                void mutate(() =>
                  request('grants', {
                    userId: f.get('userId'),
                    clientId: f.get('clientId'),
                    role: f.get('role'),
                    channelIds: f.getAll('channelIds'),
                    ...(f.get('expiry')
                      ? {
                          expiresAt: new Date(
                            String(f.get('expiry'))
                          ).toISOString(),
                        }
                      : {}),
                  })
                );
              }}
            >
              <h3>Assign staff access</h3>
              <label>
                Staff member
                <select name="userId" required>
                  {management.members
                    .filter((m) => !m.disabled)
                    .map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.user.email}
                      </option>
                    ))}
                </select>
              </label>
              {clientSelect()}
              <label>
                Role
                <select name="role">
                  <option value="EDITOR">Editor</option>
                  <option value="PUBLISHER">Publisher</option>
                  <option value="REVIEWER">
                    Reviewer
                  </option>
                </select>
              </label>
              <fieldset>
                <legend>Optional channel restriction</legend>
                <p>Leave empty for all channels within the selected client.</p>
                {management.channels
                  .filter((c) => !c.ownershipQuarantined)
                  .map((c) => (
                    <label key={c.id} className="check">
                      <input type="checkbox" name="channelIds" value={c.id} />
                      {c.name}
                    </label>
                  ))}
              </fieldset>
              <label>
                Access expiry (optional)
                <input type="datetime-local" name="expiry" />
              </label>
              <button disabled={busy}>Assign access</button>
            </form>
            <ul>
              {management.grants.map((g) => (
                <li key={g.id}>
                  {
                    management.members.find((m) => m.userId === g.userId)?.user
                      .email
                  }{' '}
                  · {clients.find((c) => c.id === g.clientId)?.name} · {g.role}{' '}
                  {g.revokedAt ? (
                    '— revoked'
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(() => request(`grants/${g.id}/revoke`, {}))
                      }
                    >
                      Revoke staff access
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form
              onSubmit={(e) => {
                const f = data(e);
                void mutate(() =>
                  request(`channels/${f.get('channelId')}/assign`, {
                    clientId: f.get('clientId'),
                  })
                );
              }}
            >
              <h3>Assign a channel</h3>
              <p>
                Reassignment quarantines existing content and pauses queued work
                for review.
              </p>
              <label>
                Channel
                <select name="channelId" required>
                  {management.channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.ownershipQuarantined ? '(unassigned)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {clientSelect()}
              <button disabled={busy}>Assign channel</button>
            </form>
          </section>
          <section aria-labelledby="credentials-heading">
            <h2 id="credentials-heading">Scoped automation credentials</h2>
            <p>
              Legacy organization keys are disabled. New credentials expire and
              default to drafts.
            </p>
            <form
              onSubmit={(e) => {
                const f = data(e);
                setSecret('');
                void mutate(async () => {
                  const key = await request('credentials', {
                    name: f.get('name'),
                    clientIds: [f.get('clientId')],
                    channelIds: f.getAll('channelIds'),
                    actions: [
                      'content:read',
                      'draft:write',
                      ...(f.get('schedule') ? ['publish:schedule'] : []),
                    ],
                    expiresAt: new Date(
                      String(f.get('expiresAt'))
                    ).toISOString(),
                  });
                  setSecret(key.secret);
                });
              }}
            >
              <label>
                Credential name
                <input name="name" required maxLength={100} />
              </label>
              {clientSelect()}
              <fieldset>
                <legend>Optional channel restriction</legend>
                {management.channels
                  .filter((c) => !c.ownershipQuarantined)
                  .map((c) => (
                    <label key={c.id} className="check">
                      <input type="checkbox" name="channelIds" value={c.id} />
                      {c.name}
                    </label>
                  ))}
              </fieldset>
              <label>
                Expiry (within 90 days)
                <input
                  type="datetime-local"
                  name="expiresAt"
                  required
                  defaultValue={new Date(
                    Date.now() +
                      7 * 86400000 -
                      new Date().getTimezoneOffset() * 60000
                  )
                    .toISOString()
                    .slice(0, 16)}
                />
              </label>
              <label className="check">
                <input type="checkbox" name="schedule" />
                Allow scheduling approved revisions
              </label>
              <button disabled={busy}>Create credential</button>
            </form>
            {secret && (
              <aside aria-label="New credential secret">
                <p>
                  Copy this secret now. It is shown once and cannot be retrieved
                  after dismissal.
                </p>
                <output aria-label="Credential secret">{secret}</output>
                <button onClick={() => setSecret('')}>Dismiss secret</button>
              </aside>
            )}
            <ul>
              {management.credentials.map((k) => (
                <li key={k.id}>
                  <strong>{k.name}</strong> · {k.prefix}… ·{' '}
                  {k.actions.join(', ')} · expires{' '}
                  {new Date(k.expiresAt).toLocaleString()}
                  {k.revokedAt ? (
                    ' — revoked'
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate(() =>
                          request(`credentials/${k.id}/revoke`, {})
                        )
                      }
                    >
                      Revoke credential
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="quarantine-heading">
            <h2 id="quarantine-heading">Legacy ownership review</h2>
            <p>
              Only map content after confirming the owning client. Mapping
              grants no publication rights.
            </p>
            {management.quarantinedMedia.map((m) => (
              <form
                key={m.id}
                onSubmit={(e) => {
                  const f = data(e);
                  void mutate(() =>
                    request(`media/${m.id}/map`, {
                      clientId: f.get('clientId'),
                    })
                  );
                }}
              >
                <strong>{m.name}</strong>
                {clientSelect()}
                <button disabled={busy}>Map media</button>
              </form>
            ))}
            {management.quarantinedPosts.map((p) => (
              <form
                key={p.id}
                onSubmit={(e) => {
                  const f = data(e);
                  void mutate(() =>
                    request(`posts/${p.id}/map`, {
                      clientId: f.get('clientId'),
                    })
                  );
                }}
              >
                <span>Content {p.id}</span>
                {clientSelect()}
                <button disabled={busy}>Map content group</button>
              </form>
            ))}
          </section>
          <section aria-labelledby="audit-heading">
            <h2 id="audit-heading">Access audit</h2>
            <ol>
              {management.audits.map((a) => (
                <li key={a.id}>
                  {a.action} · {a.resourceId} ·{' '}
                  <time>{new Date(a.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </main>
  );
}
