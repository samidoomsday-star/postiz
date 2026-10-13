'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
type Invite = {
  id: string;
  name: string;
  email: string;
  reviewerId: string;
  expiresAt: string;
  revokedAt: string | null;
  verifiedAt: string | null;
};
type Props = {
  client: string;
  channels: { id: string; name: string }[];
  request: (path: string, body?: unknown) => Promise<any>;
  onChanged: () => Promise<void>;
  onMessage: (value: string) => void;
};
export function ReviewInvitations({
  client,
  channels,
  request,
  onChanged,
  onMessage,
}: Props) {
  const [items, setItems] = useState<Invite[]>([]),
    [busy, setBusy] = useState(false),
    [all, setAll] = useState(true),
    [ids, setIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    setItems(
      client ? await request(`clients/${client}/review-invitations`) : []
    );
  }, [client, request]);
  useEffect(() => {
    setIds([]);
    setAll(true);
    load().catch((e) => onMessage(e.message));
  }, [load, onMessage]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    if (!all && !ids.length) {
      onMessage('Choose at least one review channel.');
      return;
    }
    setBusy(true);
    try {
      await request('review-invitations', {
        clientId: client,
        email: f.get('email'),
        name: f.get('name'),
        channelIds: all ? [] : ids,
      });
      form.reset();
      await load();
      await onChanged();
      onMessage(
        'Review invitation emailed. The reviewer must verify their email before opening content.'
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Invitation failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Client review invitations">
      <h2>Client review invitations</h2>
      <p>
        Invite a client reviewer for up to seven days. A verified session lasts
        at most 24 hours and can only review this client.
      </p>
      <form onSubmit={submit}>
        <label>
          Reviewer name
          <input name="name" maxLength={100} required />
        </label>
        <label>
          Reviewer email
          <input name="email" type="email" maxLength={254} required />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={all}
            onChange={(e) => setAll(e.target.checked)}
          />
          Review all channels for this client
        </label>
        {!all &&
          channels.map((c) => (
            <label key={c.id} className="check">
              <input
                type="checkbox"
                checked={ids.includes(c.id)}
                onChange={(e) =>
                  setIds((current) =>
                    e.target.checked
                      ? [...current, c.id]
                      : current.filter((id) => id !== c.id)
                  )
                }
              />
              {c.name}
            </label>
          ))}
        <button disabled={busy || !client}>Send review invitation</button>
      </form>
      <ul>
        {items.map((inv) => (
          <li key={inv.id}>
            {inv.name} · {inv.email} ·{' '}
            {inv.revokedAt
              ? 'Revoked'
              : +new Date(inv.expiresAt) <= Date.now()
              ? 'Expired'
              : inv.verifiedAt
              ? 'Email verified'
              : 'Awaiting email verification'}
            {!inv.revokedAt && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(`review-invitations/${inv.id}/revoke`, {});
                    await load();
                    await onChanged();
                    onMessage(
                      'Invitation revoked. Its sessions and invitation-bound approvals can no longer authorize future dispatch.'
                    );
                  } catch (error) {
                    onMessage(
                      error instanceof Error
                        ? error.message
                        : 'Revocation failed'
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke invitation
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
