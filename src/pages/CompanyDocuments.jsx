import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import BrandMark from '@/components/auth/BrandMark';
import { Chip, FilePicker, PURPOSE } from '@/components/DocumentExchange';

// The company's side of the document exchange, opened from the upload link the bank shares. No login: the
// token in the link is the key, and the page shows only this company's document requests and submissions.

const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm focus-visible:outline-ew-focus';
const call = async body => (await base44.functions.invoke('documentExchange', body)).data;
const errorText = e => e?.response?.data?.error || e?.message || 'Something went wrong.';
const STATE = {
  requested: ['Requested', 'border-[#b9c8f0] bg-[#eef2fc] text-ew-focus'],
  submitted: ['Sent, in review', 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber'],
  accepted: ['Accepted', 'border-ew-green-rule bg-ew-green-bg text-ew-green'],
  rejected: ['Not accepted, send another', 'border-ew-red-rule bg-ew-red-bg text-ew-red'],
};

export default function CompanyDocuments() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await call({ action: 'portal', token }));
    } catch (e) {
      setError(errorText(e));
    }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const items = data?.items || [];
  const asked = items.filter(d => d.from === 'bank' && (d.status === 'requested' || d.status === 'rejected'));
  const history = items.filter(d => !asked.includes(d));

  return (
    <div className="min-h-screen bg-ew-paper text-ew-ink">
      <header className="bg-ew-ink text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-3 text-sm font-semibold"><BrandMark className="h-5 w-5" /> Kestrel · Document exchange</div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-8">
        {error ? (
          <p role="alert" className="border border-ew-red-rule bg-ew-red-bg p-4 text-sm text-ew-red">{error}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-ew-muted"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading…</p>
        ) : (
          <>
            <h1 className="font-heading text-2xl font-bold">{data.company}</h1>
            <p className="mt-1 text-sm text-ew-muted">Your lender asked for the documents below. Send each one here, or send anything else that proves or disproves what they found. Text files and PDFs.</p>

            <section className="mt-6" aria-labelledby="asked-heading">
              <h2 id="asked-heading" className="text-sm font-semibold">Requested by your lender · {asked.length}</h2>
              {asked.length === 0 && <p className="mt-2 text-sm text-ew-muted">Nothing is waiting on you.</p>}
              <ul className="mt-2 space-y-3">{asked.map(d => <Asked key={d.id} item={d} token={token} onSent={load} />)}</ul>
            </section>

            <SendOwn token={token} onSent={load} />
            <AskBank token={token} onSent={load} />

            {history.length > 0 && (
              <section className="mt-8" aria-labelledby="history-heading">
                <h2 id="history-heading" className="text-sm font-semibold">Sent and asked</h2>
                <ul className="mt-2 divide-y divide-ew-rule-soft border border-ew-rule bg-ew-surface">
                  {history.map(d => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                      <Chip className={STATE[d.status][1]}>{d.from === 'company' && d.status === 'requested' ? 'You asked' : STATE[d.status][0]}</Chip>
                      <span className="min-w-0 flex-1 truncate">{d.title || d.name}</span>
                      {d.name && <span className="text-xs text-ew-muted">{d.name}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Asked({ item: d, token, onSent }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send() {
    if (!file) return setError('Choose a file to send.');
    setBusy(true);
    setError('');
    try {
      await call({ action: 'portal_send', token, id: d.id, ...file, note });
      await onSent();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }
  return (
    <li className="border border-ew-rule bg-ew-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip className={STATE[d.status][1]}>{STATE[d.status][0]}</Chip>
        <Chip className="border-ew-rule bg-ew-paper text-ew-ink-soft">{PURPOSE[d.purpose] || 'Context'}</Chip>
        <p className="text-sm font-semibold">{d.title}</p>
      </div>
      {d.signal_title && <p className="mt-1 text-xs text-ew-muted">About: {d.signal_title}</p>}
      {d.reason && <p className="mt-2 text-sm text-ew-ink-soft">{d.reason}</p>}
      <div className="mt-3 space-y-2">
        <FilePicker value={file} onChange={setFile} disabled={busy} id={`file-${d.id}`} />
        <input aria-label="Note for your lender" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Note for your lender (optional)" className={`${field} h-8 py-1 text-xs`} />
        {error && <p role="alert" className="text-xs text-ew-red">{error}</p>}
        <button type="button" onClick={send} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ew-ink px-3 text-xs font-semibold text-white disabled:opacity-50">{busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Send aria-hidden="true" className="h-3.5 w-3.5" />}Send</button>
      </div>
    </li>
  );
}

function SendOwn({ token, onSent }) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('disprove');
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function send(e) {
    e.preventDefault();
    if (!file) return setError('Choose a file to send.');
    setBusy(true);
    setError('');
    try {
      await call({ action: 'portal_send', token, purpose, title: title || file.name, ...file, note });
      setTitle(''); setFile(null); setNote('');
      await onSent();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={send} className="mt-8 border border-ew-rule bg-ew-surface p-4">
      <h2 className="text-sm font-semibold">Send a document your lender did not ask for</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Title<input className={`${field} mt-1`} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder="Defaults to the file name" /></label>
        <label className="text-xs font-medium">To
          <select className={`${field} mt-1`} value={purpose} onChange={e => setPurpose(e.target.value)}>
            <option value="disprove">Correct something they found</option>
            <option value="prove">Confirm something they found</option>
            <option value="context">Give context</option>
          </select>
        </label>
        <label className="text-xs font-medium sm:col-span-2">Note<input className={`${field} mt-1`} value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="What this document shows" /></label>
        <div className="sm:col-span-2"><FilePicker value={file} onChange={setFile} disabled={busy} id="own-file" /></div>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-ew-red">{error}</p>}
      <button type="submit" disabled={busy} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Send</button>
    </form>
  );
}

function AskBank({ token, onSent }) {
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function ask(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await call({ action: 'portal_request', token, title, reason });
      setTitle(''); setReason('');
      await onSent();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={ask} className="mt-4 border border-ew-rule bg-ew-surface p-4">
      <h2 className="text-sm font-semibold">Ask your lender for a document</h2>
      <p className="mt-1 text-xs text-ew-muted">For example, the article or record a finding is based on.</p>
      <div className="mt-3 grid gap-3">
        <input aria-label="What you need" className={field} value={title} maxLength={200} required onChange={e => setTitle(e.target.value)} placeholder="What you need" />
        <textarea aria-label="Why" className={field} rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why (optional)" />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-ew-red">{error}</p>}
      <button type="submit" disabled={busy} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm border border-ew-rule px-4 text-sm font-semibold hover:bg-ew-hover disabled:opacity-50">{busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Send request</button>
    </form>
  );
}
