'use client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useEffect, useRef, useState, useCallback } from 'react';
import dayjs from 'dayjs';
import { OnlyEditor } from '@gitroom/frontend/components/new-launch/editor';
import { MonthView } from '@gitroom/frontend/components/launches/calendar';
import { CalendarContext, calendarDefaults } from '@gitroom/frontend/components/launches/calendar.context';

type Channel = { id: string; name: string; providerIdentifier: string };
type Target = { channelId: string; name: string; provider: string; settings: Record<string, unknown>; publishAt: string; parts: { id: string; content: string; message: string; delay: number; media: { snapshotId: string; sourceMediaId: string; sourcePath: string; hash: string; mime: string; alt: string }[] }[] };
type Work = { id: string; clientId: string; status: string; currentVersion: number; permitted: string[]; revision: { id: string; version: number; hash: string; payload: { timezone: string; targets: Target[] } }; request: { reviewerId: string; status: string } | null; decision: { decision: string; comment: string } | null; receipts: { id: string; state: string; part: number; providerUrl: string | null; revisionId: string }[]; inFlight: boolean };
type Props = { client: string; channels: Channel[]; request: (path: string, body?: unknown) => Promise<any>; refresh: number; onError: (message: string) => void; onSaved: () => Promise<void> };
export function RevisionWorkspace({ client, channels, request, refresh, onError, onSaved }: Props) {
  const fetchApi = useFetch();
  const { backendUrl } = useVariables();
  const fetchUpload = async (clientId: string, form: FormData) => { const response = await fetchApi(`/agency/clients/${clientId}/media`, { method: 'POST', body: form }); const value = await response.json(); if (!response.ok) throw new Error(value.message || 'Upload failed'); return value; };
  const [works, setWorks] = useState<Work[]>([]);
  const [reviews, setReviews] = useState<Work[]>([]);
  const [reviewers, setReviewers] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Work | null>(null);
  const [content, setContent] = useState('');
  const [targets, setTargets] = useState<string[]>([]);
  const [media, setMedia] = useState<{ id: string; path: string; alt: string }[]>([]);
  const [proposed, setProposed] = useState(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(dayjs().startOf('month'));
  const editor = useRef<any>(null);
  const operationIds = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    setReviews(await request('reviews'));
    if (client) {
      setWorks(await request(`clients/${client}/works`));
      try { setReviewers(await request(`clients/${client}/reviewers`)); } catch { setReviewers([]); }
    } else setWorks([]);
  }, [client, request]);
  useEffect(() => { load().catch(e => onError(e.message)); }, [load, refresh, onError]);
  useEffect(() => { setTargets(channels.slice(0, 1).map(c => c.id)); setEditing(null); setContent(''); setMedia([]); }, [client, channels]);
  const operation = (work: Work, action: string) => {
    const key = `${work.id}:${work.currentVersion}:${action}`;
    if (!operationIds.current.has(key)) operationIds.current.set(key, crypto.randomUUID());
    return { expectedRevision: work.currentVersion, operationId: operationIds.current.get(key) };
  };
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await load(); await onSaved(); }
    catch (e) { onError(e instanceof Error ? e.message : 'Request failed'); }
    finally { setBusy(false); }
  };
  const edit = (work: Work) => {
    setEditing(work); setContent(work.revision.payload.targets[0].parts[0].content);
    setTargets(work.revision.payload.targets.map(t => t.channelId));
    setMedia([]); // Media copied from the immutable revision below unless explicitly replaced.
    setProposed(work.revision.payload.targets[0].publishAt.slice(0, 16));
    document.getElementById('agency-draft-editor')?.scrollIntoView({ block: 'center' });
  };
  const card = (work: Work, reviewOnly = false) => <article key={work.id} data-work-id={work.id} className="agency-revision-card">
    <h3>Revision {work.currentVersion} · {work.status}</h3>
    <p>Proposed time: {new Date(work.revision.payload.targets[0].publishAt).toLocaleString('en', { timeZone: work.revision.payload.timezone })} ({work.revision.payload.timezone})</p>
    {work.revision.payload.targets.map(t => <div key={t.channelId}><strong>{t.name}</strong>{t.parts.map((p, i) => <div key={p.id}><p>Part {i + 1}{p.delay ? ` · ${p.delay} minute delay` : ''}</p><pre>{p.message}</pre>{p.media.map(m => <p key={m.snapshotId}>{m.mime.startsWith('image/') && <img className="agency-preview" src={`${backendUrl}/agency/revisions/${work.revision.id}/media/${m.snapshotId}`} alt={m.alt || 'Proposed private asset'} />}Media: {m.alt || 'Approved asset'} · <code>{m.hash.slice(0, 12)}…</code></p>)}</div>)}</div>)}
    {work.decision?.comment && <p>Review feedback: {work.decision.comment}</p>}
    {work.inFlight && <p role="status">A mutation has been claimed. It may already be in flight; edits or cancellation cannot undo it.</p>}
    {work.receipts.map(r => <p key={r.id}>Part {r.part + 1}: {r.state}{r.providerUrl && <> · <a href={r.providerUrl} rel="noreferrer" target="_blank">Publication receipt</a></>}</p>)}
    {!reviewOnly && work.permitted.includes('draft:write') && <button type="button" disabled={busy} onClick={() => edit(work)}>Edit as new revision</button>}
    {!reviewOnly && work.status === 'DRAFT' && work.permitted.includes('draft:write') && <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(() => request(`works/${work.id}/submit`, { ...operation(work, 'submit'), reviewerId: f.get('reviewerId') })); }}><label>Designated reviewer<select name="reviewerId" required aria-label="Designated reviewer"><option value="">Choose reviewer</option>{reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><button disabled={busy}>Request review</button></form>}
    {work.status === 'IN_REVIEW' && work.permitted.includes('review:decide') && <>
      <button disabled={busy} type="button" onClick={() => void act(() => request(`works/${work.id}/approve`, operation(work, 'approve')))}>Approve this revision</button>
      <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); void act(() => request(`works/${work.id}/changes`, { ...operation(work, 'changes'), comment: f.get('comment') })); }}><label>Requested changes<textarea name="comment" maxLength={4000} required /></label><button disabled={busy}>Request changes</button></form>
    </>}
    {!reviewOnly && work.status === 'APPROVED' && work.permitted.includes('publish:schedule') && <button disabled={busy} type="button" onClick={() => void act(() => request(`works/${work.id}/schedule`, operation(work, 'schedule')))}>Schedule approved revision</button>}
    {['APPROVED', 'SCHEDULED'].includes(work.status) && work.permitted.includes('review:decide') && <button disabled={busy} type="button" onClick={() => void act(() => request(`works/${work.id}/revoke`, operation(work, 'revoke')))}>Revoke approval</button>}
    {!reviewOnly && ['APPROVED', 'SCHEDULED'].includes(work.status) && work.permitted.includes('publish:schedule') && <button disabled={busy} type="button" onClick={() => void act(() => request(`works/${work.id}/cancel`, operation(work, 'cancel')))}>Cancel queued work</button>}
  </article>;
  return <>
    {channels.length > 0 && <form id="agency-draft-editor" onSubmit={e => {
      e.preventDefault();
      if (!targets.length || !content.replace(/<[^>]*>/g, '').trim()) { onError('Choose targets and enter draft content.'); return; }
      const body = { type: 'draft', shortLink: false, tags: [] as unknown[], date: proposed + ':00.000Z', displayTimezone: 'Asia/Dhaka', posts: targets.map(id => {
        const channel = channels.find(c => c.id === id)!; const prior = editing?.revision.payload.targets.find(t => t.channelId === id);
        return { integration: { id }, settings: prior?.settings || { __type: channel.providerIdentifier }, value: [{ content, image: media.length ? media : (prior?.parts[0].media || []).map(m => ({ id: m.sourceMediaId, path: m.sourcePath })) }, ...(prior?.parts.slice(1) || []).map(p => ({ content: p.content, delay: p.delay, image: p.media.map(m => ({ id: m.sourceMediaId, path: m.sourcePath })) }))] };
      }), ...(editing ? operation(editing, 'edit') : {}) };
      void act(async () => { await request(editing ? `works/${editing.id}/revisions` : 'posts', body); setEditing(null); setContent(''); setMedia([]); });
    }}>
      <h3>{editing ? `Edit revision ${editing.currentVersion} → new draft` : 'Prepare a draft'}</h3>
      <fieldset><legend>Target channels (one client)</legend>{channels.map(c => <label key={c.id} className="check"><input type="checkbox" checked={targets.includes(c.id)} onChange={e => setTargets(current => e.target.checked ? [...current, c.id] : current.filter(id => id !== c.id))} />{c.name}</label>)}</fieldset>
      <label>Proposed publication time (UTC)<input name="proposed" aria-label="Proposed publication time (UTC)" type="datetime-local" value={proposed} onChange={e => setProposed(e.target.value)} required /></label>
      <p>Review shows the same instant in Asia/Dhaka. Changing the time creates a new revision that needs approval.</p>
      <div className="agency-editor" aria-label="Postiz draft editor"><p>Draft content</p><button type="button" onClick={() => editor.current?.editor?.chain().focus().toggleBold().run()}>Bold</button><button type="button" onClick={() => editor.current?.editor?.chain().focus().toggleUnderline().run()}>Underline</button><OnlyEditor key={editing?.revision.id || 'new'} ref={editor} agencyLabel="Draft content" editorType="normal" value={content} onChange={setContent} /></div>
      <label>Add private media (up to 20 MB)<input type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        const f = new FormData(); f.set('file', file);
        // Upload uses the existing authenticated fetch context; multipart stays intact.
        try {
          const response = await fetchUpload(client, f);
          setMedia(current => [...current, response]);
        } catch (error) { onError(error instanceof Error ? error.message : 'Upload failed'); }
      }} /></label>
      {media.map(m => <p key={m.id}>Private media attached <button type="button" onClick={() => setMedia(current => current.filter(x => x.id !== m.id))}>Remove attachment</button></p>)}
      <button disabled={busy}>{editing ? 'Save new revision' : 'Save draft'}</button>
      {editing && <button type="button" onClick={() => { setEditing(null); setContent(''); setMedia([]); }}>Close revision editor</button>}
    </form>}
    {client && <section aria-label="Client approval calendar"><h2>Client calendar</h2><div><button type="button" onClick={() => setMonth(m => m.subtract(1, 'month'))}>Previous month</button><span>{month.format('MMMM YYYY')}</span><button type="button" onClick={() => setMonth(m => m.add(1, 'month'))}>Next month</button></div><div className="agency-calendar"><CalendarContext.Provider value={{ ...calendarDefaults, startDate: month.format('YYYY-MM-DD'), display: 'month', loading: false, agencyItems: works.map(w => ({ id: w.id, content: w.revision.payload.targets[0].parts[0].message, publishAt: w.revision.payload.targets[0].publishAt, status: w.status })), onAgencyWork: id => document.querySelector(`[data-work-id="${id}"]`)?.scrollIntoView({ block: 'center' }) }}><MonthView /></CalendarContext.Provider></div></section>}
    {client && <section aria-label="Client revisions"><h2>Content revisions</h2>{works.map(w => card(w))}</section>}
    {reviews.length > 0 && <section aria-label="Assigned internal reviews"><h2>Assigned reviews</h2>{reviews.filter(w => !works.some(x => x.id === w.id)).map(w => card(w, true))}</section>}
  </>;
}
