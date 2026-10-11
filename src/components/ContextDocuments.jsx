import React, { useRef, useState } from 'react';
import { FileText, Loader2, Plus, X } from 'lucide-react';

// Context documents for an audit rerun: call notes, a borrower's letter, statements as text. The audit quotes
// the sentences in them that relate to each flag, word for word. Text files are read in the browser; PDFs
// are uploaded and read on the server (signed in only), via onReadPdf.

const MAX_DOCUMENTS = 5;
const MAX_CHARS = 100000;
const TEXT_TYPES = /\.(txt|md|csv)$/i;
const SAMPLE = { url: '/samples/sample-context-memo.txt', name: 'sample-context-memo.txt' };

export default function ContextDocuments({ documents, onChange, disabled = false, onReadPdf = null }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const full = documents.length >= MAX_DOCUMENTS;

  function add(name, text, truncated = false) {
    const trimmed = text.trim();
    if (!trimmed) throw new Error(`${name} has no readable text.`);
    onChange(ds => [...ds, { id: crypto.randomUUID(), name, text: trimmed.slice(0, MAX_CHARS), truncated: truncated || trimmed.length > MAX_CHARS }]);
  }

  async function addFiles(files) {
    setError('');
    setBusy(true);
    try {
      for (const file of [...files].slice(0, MAX_DOCUMENTS - documents.length)) {
        if (TEXT_TYPES.test(file.name) || file.type.startsWith('text/')) add(file.name, await file.text());
        else if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
          if (!onReadPdf) throw new Error('Sign in to add PDF documents. Text files work without signing in.');
          const { text, truncated } = await onReadPdf(file);
          add(file.name, text, truncated);
        } else throw new Error(`${file.name}: add a .txt, .md, .csv or .pdf file.`);
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || 'Could not read that file.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function addSample() {
    setError('');
    try {
      const res = await fetch(SAMPLE.url);
      add(SAMPLE.name, await res.text());
    } catch {
      setError('Could not load the sample document.');
    }
  }

  return (
    <div className="mt-6 border-t border-ew-rule pt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Context documents</h3>
          <p className="mt-1 text-xs text-ew-muted">Call notes, a letter from the company, statements as text. The audit quotes the sentences that relate to each flag. They never change the status.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={addSample} disabled={disabled || busy || full} className="h-8 rounded-sm px-2.5 text-xs font-medium text-ew-ink-soft underline underline-offset-2 hover:text-ew-ink disabled:opacity-50">Use sample document</button>
          <button type="button" onClick={() => input.current?.click()} disabled={disabled || busy || full} className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-ew-rule bg-ew-surface px-3 text-xs font-semibold hover:bg-ew-hover disabled:opacity-50">
            {busy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Plus aria-hidden="true" className="h-3.5 w-3.5" />}
            {busy ? 'Reading…' : 'Add document'}
          </button>
          <input ref={input} type="file" multiple accept=".txt,.md,.csv,.pdf,text/plain,text/markdown,text/csv,application/pdf" className="sr-only" aria-label="Add context documents" onChange={e => addFiles(e.target.files || [])} />
        </div>
      </div>
      {error && <p role="alert" className="mt-3 border border-ew-red-rule bg-ew-red-bg p-2.5 text-xs text-ew-red">{error}</p>}
      {documents.length > 0 ? (
        <ul className="mt-3 divide-y divide-ew-rule-soft border border-ew-rule-soft">
          {documents.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-ew-muted" />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-ew-muted">{d.text.length.toLocaleString('en-US')} characters{d.truncated ? ' (trimmed)' : ''}</span>
              <button type="button" onClick={() => onChange(ds => ds.filter(x => x.id !== d.id))} disabled={disabled} aria-label={`Remove ${d.name}`} className="rounded-sm p-1 text-ew-muted hover:bg-ew-paper hover:text-ew-ink">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ew-muted">No documents added. Up to {MAX_DOCUMENTS}, used in the next run.</p>
      )}
    </div>
  );
}

/** The passages a run quoted for one flag, from the officer's documents. */
export function DocumentPassages({ passages }) {
  if (!passages?.length) return null;
  return (
    <div className="mt-3 border-l-2 border-ew-focus bg-[#eef2fc] px-3 py-2">
      <p className="text-xs font-semibold text-ew-focus">From your documents</p>
      <ul className="mt-1 space-y-1.5">
        {passages.map((p, i) => (
          <li key={i} className="text-sm text-ew-ink-soft">
            “{p.quote}”<span className="ml-1 text-xs text-ew-muted">({p.doc_name})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
