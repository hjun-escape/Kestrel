import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, FileText, Loader2, Plus, Send, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

// The bank's side of the document exchange: ask the company for documents that prove or disprove a flag,
// add documents yourself, answer what the company asks for, and review every document that comes in
// (accept or reject, and what it shows). Accepted documents feed the next audit. The company uses its own
// upload link (/documents/:token), no login.

export const PURPOSE = { prove: 'Prove', disprove: 'Disprove', context: 'Context' };
export const STATUS = {
  requested: ['Requested', 'border-[#b9c8f0] bg-[#eef2fc] text-ew-focus'],
  submitted: ['To review', 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber'],
  accepted: ['Accepted', 'border-ew-green-rule bg-ew-green-bg text-ew-green'],
  rejected: ['Rejected', 'border-ew-red-rule bg-ew-red-bg text-ew-red'],
};
const FINDINGS = [['supports', 'Supports the flag'], ['contradicts', 'Contradicts the flag'], ['no_bearing', 'No bearing on a flag']];
const FINDING_LABEL = Object.fromEntries(FINDINGS);
const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm focus-visible:outline-ew-focus';
const call = async body => (await base44.functions.invoke('documentExchange', body)).data;
const errorText = e => e?.response?.data?.error || e?.message || 'Something went wrong.';

export function Chip({ className, children }) {
  return <span className={`inline-flex rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${className}`}>{children}</span>;
}

/** Read a picked file as text (text files in the browser; PDFs uploaded for the server to read). */
export async function readPicked(file) {
  if (/\.(txt|md|csv)$/i.test(file.name) || file.type.startsWith('text/')) return { name: file.name, text: await file.text() };
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const up = await base44.integrations.Core.UploadFile({ file });
    return { name: file.name, file_url: up.file_url };
  }
  throw new Error('Send a .txt, .md, .csv or .pdf file.');
}

export function FilePicker({ value, onChange, disabled, id }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function pick(files) {
    setError('');
    if (!files?.[0]) return;
    setBusy(true);
    try {
      onChange(await readPicked(files[0]));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={disabled || busy} onClick={() => ref.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-surface px-3 text-xs font-semibold hover:bg-ew-hover disabled:opacity-50">
          {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <FileText aria-hidden="true" className="h-3.5 w-3.5" />}
          {value ? 'Choose another file' : 'Choose file'}
        </button>
        {value && <span className="text-xs text-ew-ink-soft">{value.name}{value.text ? ` · ${value.text.length.toLocaleString('en-US')} characters` : ' · read on upload'}</span>}
        <input id={id} ref={ref} type="file" accept=".txt,.md,.csv,.pdf,text/plain,text/markdown,text/csv,application/pdf" className="sr-only" onChange={e => pick(e.target.files)} />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-ew-red">{error}</p>}
    </div>
  );
}

export default function DocumentExchange({ borrower, signals, onChanged = null }) {
  const [items, setItems] = useState([]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // 'request' | 'send' | {answer: item}
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await call({ action: 'list', borrower_id: borrower.id });
      setItems(data.items || []);
      setToken(data.portal_token || '');
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [borrower.id]);
  useEffect(() => { load(); }, [load]);

  async function act(body) {
    await call({ borrower_id: borrower.id, ...body });
    await load();
    onChanged?.();
  }

  async function copyLink() {
    let t = token;
    if (!t) {
      const data = await call({ action: 'portal_link', borrower_id: borrower.id });
      t = data.portal_token;
      setToken(t);
    }
    const url = `${window.location.origin}/documents/${t}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Company upload link', url);
    }
  }

  const groups = [
    ['To review', items.filter(d => d.status === 'submitted')],
    ['Waiting on the company', items.filter(d => d.status === 'requested' && d.from === 'bank')],
    ['The company asked for', items.filter(d => d.status === 'requested' && d.from === 'company')],
    ['Reviewed', items.filter(d => d.status === 'accepted' || d.status === 'rejected')],
  ];

  return (
    <section aria-labelledby="exchange-heading" className="border border-ew-rule bg-ew-surface">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-ew-rule px-5 py-5">
        <div>
          <h2 id="exchange-heading" className="font-heading text-xl font-bold">Documents</h2>
          <p className="mt-1 max-w-2xl text-sm text-ew-muted">Ask the company for documents that prove or disprove a flag, or add your own. Review each one: accepted documents make the next audit more precise. They never change the status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={copyLink} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-ew-rule px-3 text-sm font-medium hover:bg-ew-hover">
            {copied ? <Check aria-hidden="true" className="h-4 w-4 text-ew-green" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? 'Link copied' : 'Copy company upload link'}
          </button>
          <button type="button" onClick={() => setMode('send')} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-ew-rule px-3 text-sm font-medium hover:bg-ew-hover"><Plus aria-hidden="true" className="h-4 w-4" />Add a document</button>
          <button type="button" onClick={() => setMode('request')} className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ew-ink px-3 text-sm font-semibold text-white hover:bg-ew-ink-soft"><Send aria-hidden="true" className="h-4 w-4" />Request a document</button>
        </div>
      </header>
      {mode && <ItemForm mode={mode} signals={signals} onCancel={() => setMode(null)} onSubmit={async body => { await act(body); setMode(null); }} />}
      <div className="px-5 py-4">
        {error && <p role="alert" className="mb-3 border border-ew-red-rule bg-ew-red-bg p-3 text-sm text-ew-red">{error}</p>}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-ew-muted"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading documents…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-ew-muted">No documents yet. Request one for a flag, or send the company its upload link so it can send its own.</p>
        ) : (
          groups.filter(([, list]) => list.length).map(([title, list]) => (
            <div key={title} className="mb-5">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ew-muted">{title} · {list.length}</h3>
              <ul className="space-y-2">{list.map(d => <ExchangeItem key={d.id} item={d} onAct={act} onAnswer={() => setMode({ answer: d })} />)}</ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ItemForm({ mode, signals, onCancel, onSubmit }) {
  const answering = typeof mode === 'object' ? mode.answer : null;
  const sending = mode === 'send' || answering;
  const [purpose, setPurpose] = useState('disprove');
  const [signalId, setSignalId] = useState('');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (sending && !file) return setError('Choose a file to send.');
    setBusy(true);
    try {
      if (answering) await onSubmit({ action: 'send', id: answering.id, ...file, note: reason });
      else if (sending) await onSubmit({ action: 'send', purpose, signal_id: signalId, title: title || file.name, ...file, note: reason });
      else await onSubmit({ action: 'request', purpose, signal_id: signalId, title, reason });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border-b border-ew-rule bg-ew-paper px-5 py-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{answering ? `Send: ${answering.title}` : sending ? 'Add a document' : 'Request a document from the company'}</h3>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-ew-muted hover:text-ew-ink"><X aria-hidden="true" className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {!answering && (
          <>
            <label className="text-xs font-medium">Flag (optional)
              <select className={`${field} mt-1`} value={signalId} onChange={e => setSignalId(e.target.value)}>
                <option value="">No specific flag</option>
                {signals.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium">To
              <select className={`${field} mt-1`} value={purpose} onChange={e => setPurpose(e.target.value)}>
                <option value="prove">Prove the flag</option>
                <option value="disprove">Disprove the flag</option>
                <option value="context">Give context</option>
              </select>
            </label>
            <label className="text-xs font-medium sm:col-span-2">{sending ? 'Title (optional)' : 'What to send'}
              <input className={`${field} mt-1`} value={title} maxLength={200} onChange={e => setTitle(e.target.value)} placeholder={sending ? 'Defaults to the file name' : 'Board minutes confirming the CFO is still in role'} required={!sending} />
            </label>
          </>
        )}
        <label className="text-xs font-medium sm:col-span-2">{sending ? 'Note (optional)' : 'Why (shown to the company)'}
          <textarea className={`${field} mt-1`} rows={2} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} placeholder={sending ? 'What this document shows' : 'A news report says your CFO left in September.'} />
        </label>
        {sending && <div className="sm:col-span-2"><FilePicker value={file} onChange={setFile} disabled={busy} id="exchange-file" /></div>}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-ew-red">{error}</p>}
      <button type="submit" disabled={busy} className="mt-3 inline-flex h-9 items-center gap-2 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
        {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}{sending ? 'Send' : 'Send request'}
      </button>
    </form>
  );
}

function ExchangeItem({ item: d, onAct, onAnswer }) {
  const [open, setOpen] = useState(d.status === 'submitted');
  const [finding, setFinding] = useState(d.signal_id ? '' : 'no_bearing');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [label, tone] = STATUS[d.status];

  async function review(decision) {
    setError('');
    setBusy(decision);
    try {
      await onAct({ action: 'review', id: d.id, decision, finding, note });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <li className="border border-ew-rule">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-ew-hover">
        <Chip className={tone}>{label}</Chip>
        <Chip className="border-ew-rule bg-ew-paper text-ew-ink-soft">{d.from === 'bank' ? 'Bank' : 'Company'}</Chip>
        <Chip className="border-ew-rule bg-ew-surface text-ew-ink-soft">{PURPOSE[d.purpose] || 'Context'}</Chip>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title || d.name}</span>
        {d.signal_title && <span className="truncate text-xs text-ew-muted">Flag: {d.signal_title}</span>}
      </button>
      {open && (
        <div className="space-y-2 border-t border-ew-rule-soft px-3 py-3 text-sm">
          {d.reason && <p className="text-ew-ink-soft"><span className="font-semibold text-ew-ink">Asked: </span>{d.reason}</p>}
          {d.name && <p className="text-xs text-ew-muted">{d.name} · sent by {d.submitted_by} · {d.submitted_at ? new Date(d.submitted_at).toLocaleString() : ''}{d.chars ? ` · ${d.chars.toLocaleString('en-US')} characters` : ''}</p>}
          {d.note && <p className="text-ew-ink-soft"><span className="font-semibold text-ew-ink">Note: </span>{d.note}</p>}
          {d.excerpt && <pre className="max-h-48 overflow-auto whitespace-pre-wrap border border-ew-rule-soft bg-ew-paper p-2.5 font-sans text-xs leading-relaxed text-ew-ink-soft">{d.excerpt}{d.chars > d.excerpt.length ? '…' : ''}</pre>}
          {d.status === 'requested' && d.from === 'company' && (
            <button type="button" onClick={onAnswer} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ew-ink px-3 text-xs font-semibold text-white"><Send aria-hidden="true" className="h-3.5 w-3.5" />Send it</button>
          )}
          {d.status === 'requested' && d.from === 'bank' && <p className="text-xs text-ew-muted">Waiting for the company to send it through its upload link.</p>}
          {(d.status === 'accepted' || d.status === 'rejected') && (
            <p className={`text-xs ${d.status === 'accepted' ? 'text-ew-green' : 'text-ew-red'}`}>
              {d.status === 'accepted' ? `Accepted: ${FINDING_LABEL[d.finding] || ''}` : 'Rejected'} · {d.reviewed_by} · {d.reviewed_at ? new Date(d.reviewed_at).toLocaleString() : ''}{d.review_note ? ` · ${d.review_note}` : ''}
            </p>
          )}
          {d.status === 'submitted' && (
            <div className="border-t border-ew-rule-soft pt-2">
              <p className="text-xs font-semibold">What does it show?</p>
              <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="What the document shows">
                {FINDINGS.map(([value, text]) => (
                  <button key={value} type="button" role="radio" aria-checked={finding === value} disabled={value !== 'no_bearing' && !d.signal_id} onClick={() => setFinding(value)} className={`rounded-sm border px-2.5 py-1 text-xs font-medium disabled:opacity-40 ${finding === value ? 'border-ew-ink bg-ew-ink text-white' : 'border-ew-rule hover:bg-ew-hover'}`}>{text}</button>
                ))}
              </div>
              <input aria-label="Review note" value={note} maxLength={1000} onChange={e => setNote(e.target.value)} placeholder="Review note (required to reject)" className={`${field} mt-2 h-8 py-1 text-xs`} />
              {error && <p role="alert" className="mt-1 text-xs text-ew-red">{error}</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={!!busy || !finding} onClick={() => review('accept')} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-green-rule bg-ew-green-bg px-3 text-xs font-semibold text-ew-green disabled:opacity-50">{busy === 'accept' ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Check aria-hidden="true" className="h-3.5 w-3.5" />}Accept</button>
                <button type="button" disabled={!!busy} onClick={() => review('reject')} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-red-rule bg-ew-red-bg px-3 text-xs font-semibold text-ew-red disabled:opacity-50">{busy === 'reject' ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <X aria-hidden="true" className="h-3.5 w-3.5" />}Reject</button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
