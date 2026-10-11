import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, FileText, Loader2, RotateCcw, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { warningScore } from '@/lib/warningScore.ts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent as SharedDialogContent, DialogTitle as SharedDialogTitle, DialogDescription as SharedDialogDescription } from '@/components/ui/dialog';

const DialogContent = /** @type {React.ComponentType<any>} */ (SharedDialogContent);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);

// The bank's side of the document exchange, as a conversation with the company: the bank asks for a document
// about a flag, the company sends it through its upload link (/documents/:token), and the bank reviews it in a
// modal (accept or reject, and what it shows). Accepted documents are used when the audit runs again.

export const PURPOSE = { prove: 'Prove', disprove: 'Disprove', context: 'Context' };
export const STATUS = {
  requested: ['Waiting', 'border-[#b9c8f0] bg-[#eef2fc] text-ew-focus'],
  submitted: ['To review', 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber'],
  accepted: ['Accepted', 'border-ew-green-rule bg-ew-green-bg text-ew-green'],
  rejected: ['Rejected', 'border-ew-red-rule bg-ew-red-bg text-ew-red'],
};
const FINDINGS = [['supports', 'Supports the flag'], ['contradicts', 'Contradicts the flag'], ['no_bearing', 'No bearing']];
const FINDING_LABEL = Object.fromEntries(FINDINGS);
const BAND = { red: 'Red', yellow: 'Yellow', green: 'Green' };
const BAND_TONE = { red: 'text-ew-red', yellow: 'text-ew-amber', green: 'text-ew-green' };
const TRIGGER = 'h-[38px] rounded-sm border-ew-rule bg-ew-surface text-left text-sm text-ew-ink focus:ring-2 focus:ring-[#2d5bd7]/25 [&>span]:truncate';
const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm focus-visible:outline-ew-focus';
const call = async body => (await base44.functions.invoke('documentExchange', body)).data;
const errorText = e => e?.response?.data?.error || e?.message || 'Something went wrong.';
const when = iso => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
export const SAMPLE_DOCUMENT = { url: '/samples/sample-context-memo.txt', name: 'sample-context-memo.txt' };

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

/** Choose a file, or use the fictional demo document. */
export function FilePicker({ value, onChange, disabled, id }) {
  const ref = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(fn) {
    setError('');
    setBusy(true);
    try {
      onChange(await fn());
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
        <button type="button" disabled={disabled || busy} onClick={() => run(async () => ({ name: SAMPLE_DOCUMENT.name, text: await (await fetch(SAMPLE_DOCUMENT.url)).text() }))} className="h-8 px-1 text-xs font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink disabled:opacity-50">
          Use demo document
        </button>
        {value && <span className="text-xs text-ew-ink-soft">{value.name}</span>}
        <input id={id} ref={ref} type="file" accept=".txt,.md,.csv,.pdf,text/plain,text/markdown,text/csv,application/pdf" className="sr-only" onChange={e => e.target.files?.[0] && run(() => readPicked(e.target.files[0]))} />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-ew-red">{error}</p>}
    </div>
  );
}

export default function DocumentExchange({ borrower, signals, onRerunAudit = null, onItemsChange = null }) {
  const [items, setItems] = useState([]);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [reviewing, setReviewing] = useState(null);
  const [acceptedSince, setAcceptedSince] = useState(0);
  const endRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await call({ action: 'list', borrower_id: borrower.id });
      setItems(data.items || []);
      onItemsChange?.(data.items || []);
      setToken(data.portal_token || '');
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [borrower.id, onItemsChange]);
  useEffect(() => { load(); }, [load]);
  // Pick up what the company sends while the tab is open.
  useEffect(() => {
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  // The conversation, oldest first: each request, then the document that answered it.
  const thread = useMemo(() => {
    const out = [];
    for (const d of [...items].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
      if (d.reason || d.status === 'requested' || (d.from === 'bank' && d.submitted_by !== d.created_by)) out.push({ kind: 'ask', side: d.from, d, at: d.created_at });
      if (d.name) out.push({ kind: 'doc', side: d.submitted_by === 'company' ? 'company' : 'bank', d, at: d.submitted_at || d.created_at });
    }
    return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }, [items]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [thread.length]);

  async function copyLink() {
    let t = token;
    if (!t) {
      t = (await call({ action: 'portal_link', borrower_id: borrower.id })).portal_token;
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

  return (
    <section aria-labelledby="exchange-heading" className="border border-ew-rule bg-ew-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ew-rule px-5 py-4">
        <div>
          <h2 id="exchange-heading" className="font-heading text-xl font-bold">Documents</h2>
          <p className="mt-0.5 text-sm text-ew-muted">Ask the company for documents about a flag. Accepted documents are used the next time the audit runs.</p>
        </div>
        <div className="flex gap-2">
          {token && (
            <a href={`/documents/${token}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-sm px-2 text-sm font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink">
              Open company view
            </a>
          )}
          <button type="button" onClick={copyLink} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-ew-rule px-3 text-sm font-medium hover:bg-ew-hover">
            {copied ? <Check aria-hidden="true" className="h-4 w-4 text-ew-green" /> : <Copy aria-hidden="true" className="h-4 w-4" />}
            {copied ? 'Link copied' : 'Copy upload link'}
          </button>
        </div>
      </header>

      {acceptedSince > 0 && onRerunAudit && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ew-green-rule bg-ew-green-bg px-5 py-2.5 text-sm text-ew-green">
          <span>{acceptedSince} document{acceptedSince === 1 ? '' : 's'} accepted. Run the audit again to use {acceptedSince === 1 ? 'it' : 'them'}.</span>
          <button type="button" onClick={() => { setAcceptedSince(0); onRerunAudit(); }} className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-ew-ink px-3 text-xs font-semibold text-white"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />Rerun audit</button>
        </div>
      )}

      <div role="log" aria-label="Document conversation" className="max-h-[520px] space-y-3 overflow-y-auto bg-ew-paper px-5 py-4">
        {error && <p role="alert" className="border border-ew-red-rule bg-ew-red-bg p-3 text-sm text-ew-red">{error}</p>}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-ew-muted"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Loading…</p>
        ) : thread.length === 0 ? (
          <p className="text-sm text-ew-muted">No messages yet. Request a document below, then copy the upload link for the company.</p>
        ) : (
          thread.map((m, i) => <Bubble key={`${m.d.id}-${m.kind}-${i}`} m={m} onReview={() => setReviewing(m.d)} />)
        )}
        <div ref={endRef} />
      </div>

      <RequestForm signals={signals} onSend={async body => { await call({ borrower_id: borrower.id, action: 'request', ...body }); await load(); }} />

      <ReviewModal
        doc={reviewing}
        signals={signals}
        onClose={() => setReviewing(null)}
        onDone={async (decision) => {
          await load();
          if (decision === 'accept') setAcceptedSince(n => n + 1);
          setReviewing(null);
        }}
        borrowerId={borrower.id}
      />
    </section>
  );
}

function Bubble({ m, onReview }) {
  const { d } = m;
  const bank = m.side === 'bank';
  const [label, tone] = STATUS[d.status];
  return (
    <div className={`flex ${bank ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-lg border px-3.5 py-2.5 text-sm ${bank ? 'rounded-br-sm border-ew-ink bg-ew-ink text-white' : 'rounded-bl-sm border-ew-rule bg-ew-surface text-ew-ink'}`}>
        <p className={`text-[11px] font-semibold ${bank ? 'text-white/60' : 'text-ew-muted'}`}>{bank ? 'Bank' : 'Company'} · {when(m.at)}</p>
        {m.kind === 'ask' ? (
          <>
            <p className="mt-0.5 font-semibold">Please send: {d.title}</p>
            {d.signal_title && <p className={`text-xs ${bank ? 'text-white/70' : 'text-ew-muted'}`}>{PURPOSE[d.purpose]} the flag: {d.signal_title}</p>}
            {d.reason && <p className={`mt-1 ${bank ? 'text-white/85' : 'text-ew-ink-soft'}`}>{d.reason}</p>}
          </>
        ) : (
          <>
            <p className="mt-0.5 flex items-center gap-1.5 font-semibold"><FileText aria-hidden="true" className="h-4 w-4" />{d.name}</p>
            {d.note && <p className={`mt-1 ${bank ? 'text-white/85' : 'text-ew-ink-soft'}`}>{d.note}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip className={tone}>{d.status === 'accepted' && d.finding ? `Accepted · ${FINDING_LABEL[d.finding]}` : label}</Chip>
              {d.status === 'submitted' && (
                <button type="button" onClick={onReview} className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${bank ? 'bg-white text-ew-ink' : 'bg-ew-ink text-white'}`}>Review</button>
              )}
              {d.status !== 'submitted' && (
                <button type="button" onClick={onReview} className={`text-xs underline underline-offset-2 ${bank ? 'text-white/70' : 'text-ew-muted'}`}>Open</button>
              )}
            </div>
            {d.review_note && <p className={`mt-1 text-xs ${bank ? 'text-white/70' : 'text-ew-muted'}`}>Review: {d.review_note}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function RequestForm({ signals, onSend }) {
  const [signalId, setSignalId] = useState('');
  const [purpose, setPurpose] = useState('disprove');
  const [title, setTitle] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSend({ signal_id: signalId, purpose, title, reason });
      setTitle('');
      setReason('');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="border-t border-ew-rule px-5 py-4">
      <p className="text-sm font-semibold">Request a document</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_150px]">
        <Select value={signalId || 'none'} onValueChange={v => setSignalId(v === 'none' ? '' : v)}>
          <SelectTrigger aria-label="Flag" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-sm border-ew-rule bg-ew-surface text-ew-ink">
            <SelectItem value="none">No specific flag</SelectItem>
            {signals.map(s => <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={purpose} onValueChange={setPurpose}>
          <SelectTrigger aria-label="To" className={TRIGGER}><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-sm border-ew-rule bg-ew-surface text-ew-ink">
            <SelectItem value="disprove">To disprove it</SelectItem>
            <SelectItem value="prove">To prove it</SelectItem>
            <SelectItem value="context">For context</SelectItem>
          </SelectContent>
        </Select>
        <input aria-label="What to send" className={`${field} sm:col-span-2`} value={title} maxLength={200} required onChange={e => setTitle(e.target.value)} placeholder="What to send, e.g. a letter showing which sites stay open" />
        <div className="flex gap-2 sm:col-span-2">
          <input aria-label="Why" className={field} value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="Why (the company sees this)" />
          <button type="submit" disabled={busy} className="inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Send aria-hidden="true" className="h-4 w-4" />}Send
          </button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-ew-red">{error}</p>}
    </form>
  );
}

function ReviewModal({ doc, signals, onClose, onDone, borrowerId }) {
  const [finding, setFinding] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setFinding(doc?.signal_id ? '' : 'no_bearing');
    setNote('');
    setError('');
  }, [doc?.id]);
  const now = useMemo(() => warningScore(signals), [signals]);
  const without = useMemo(() => (doc?.signal_id ? warningScore(signals.filter(s => s.id !== doc.signal_id)) : null), [signals, doc?.signal_id]);
  if (!doc) return null;
  const open = doc.status === 'submitted';

  async function review(decision) {
    setError('');
    setBusy(decision);
    try {
      await call({ action: 'review', borrower_id: borrowerId, id: doc.id, decision, finding, note });
      await onDone(decision);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-sm border-ew-rule bg-ew-surface text-ew-ink sm:max-w-2xl sm:rounded-sm">
        <DialogTitle className="font-heading text-lg font-bold">{open ? 'Review document' : 'Document'}: {doc.name}</DialogTitle>
        <DialogDescription className="text-sm text-ew-muted">
          {doc.signal_title ? `Sent to ${PURPOSE[doc.purpose]?.toLowerCase() || 'explain'} the flag “${doc.signal_title}”.` : 'Not linked to a flag.'} From the {doc.submitted_by === 'company' ? 'company' : 'bank'} · {when(doc.submitted_at)}
        </DialogDescription>
        {doc.note && <p className="text-sm"><span className="font-semibold">Note: </span>{doc.note}</p>}
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap border border-ew-rule-soft bg-ew-paper p-3 font-sans text-[13px] leading-relaxed text-ew-ink-soft">{doc.excerpt}{doc.chars > (doc.excerpt || '').length ? '…' : ''}</pre>
        {open ? (
          <>
            <div>
              <p className="text-sm font-semibold">What does it show?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What the document shows">
                {FINDINGS.map(([value, text]) => (
                  <button key={value} type="button" role="radio" aria-checked={finding === value} disabled={value !== 'no_bearing' && !doc.signal_id} onClick={() => setFinding(value)} className={`rounded-sm border px-3 py-2 text-sm font-medium disabled:opacity-40 ${finding === value ? 'border-ew-ink bg-ew-ink text-white' : 'border-ew-rule hover:bg-ew-hover'}`}>{text}</button>
                ))}
              </div>
              {finding === 'contradicts' && without && (
                <p className="mt-2 text-sm">
                  Warning score <span className={`font-semibold ${BAND_TONE[now.band]}`}>{now.score} {BAND[now.band]}</span> →{' '}
                  <span className={`font-semibold ${BAND_TONE[without.band]}`}>{without.score} {BAND[without.band]}</span> in the audit's review preview if this flag is set aside. The company's status itself does not change.
                </p>
              )}
            </div>
            <label className="block text-sm font-semibold">Reason
              <textarea className={`${field} mt-1 font-normal`} rows={2} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} placeholder="Why you accept or reject it (required to reject)" />
            </label>
            {error && <p role="alert" className="text-sm text-ew-red">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={!!busy || !finding} onClick={() => review('accept')} className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white disabled:opacity-50">{busy === 'accept' ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Check aria-hidden="true" className="h-4 w-4" />}Accept</button>
              <button type="button" disabled={!!busy} onClick={() => review('reject')} className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-ew-red-rule bg-ew-red-bg px-4 text-sm font-semibold text-ew-red disabled:opacity-50">{busy === 'reject' && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Reject</button>
            </div>
          </>
        ) : (
          <p className="text-sm">
            <Chip className={STATUS[doc.status][1]}>{STATUS[doc.status][0]}</Chip>{' '}
            {doc.finding ? FINDING_LABEL[doc.finding] : ''} · {doc.reviewed_by} · {when(doc.reviewed_at)}{doc.review_note ? ` · ${doc.review_note}` : ''}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
