'use client';
import { useState } from 'react';
type Entry = {
  id: string;
  revision: number;
  kind: string;
  body: string;
  author: string;
};
export function ReviewFeedback({
  workId,
  version,
  editable,
  request,
  onMessage,
}: {
  workId: string;
  version: number;
  editable: boolean;
  request: (path: string, body?: unknown) => Promise<any>;
  onMessage: (value: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [shown, setShown] = useState(false),
    [busy, setBusy] = useState(false);
  const load = async () => {
    setEntries(await request(`works/${workId}/review-comments`));
    setShown(true);
  };
  return (
    <section aria-label="Client-visible review feedback">
      <button
        type="button"
        disabled={busy}
        onClick={() => void load().catch((e) => onMessage(e.message))}
      >
        Show review feedback
      </button>
      {shown && (
        <>
          <ul>
            {entries.map((e) => (
              <li key={e.id}>
                {e.author} · revision {e.revision} ·{' '}
                {e.kind.replace(/_/g, ' ')}
                <p>{e.body}</p>
              </li>
            ))}
          </ul>
          {editable && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  comment = String(new FormData(form).get('comment') || '');
                setBusy(true);
                try {
                  await request(`works/${workId}/review-comments`, {
                    expectedRevision: version,
                    operationId: crypto.randomUUID(),
                    comment,
                  });
                  form.reset();
                  await load();
                  onMessage(
                    'Client-visible feedback saved. Revision approval is unchanged.'
                  );
                } catch (error) {
                  onMessage(
                    error instanceof Error ? error.message : 'Feedback failed'
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                Feedback (visible to the client)
                <textarea name="comment" maxLength={4000} required />
              </label>
              <button disabled={busy}>Add client-visible feedback</button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
