import React from 'react';
import { ChevronDown, X } from 'lucide-react';

const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm text-ew-ink placeholder:text-ew-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ew-focus';
const CHECK_NAMES = { identity: 'Company identity', quote: 'Source evidence', support: 'Claim support', freshness: 'Dates and freshness', duplicates: 'Duplicate signals', score: 'Score consistency' };

export default function ConsiderationEditor({ consideration: c, index, signals, disabled, onChange, onRemove }) {
  return <fieldset disabled={disabled} className={`min-w-0 border border-ew-rule bg-ew-surface ${c.enabled ? '' : 'bg-ew-hover'}`}>
    <legend className="sr-only">Consideration {index + 1}</legend>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ew-rule-soft px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wider text-ew-muted">Consideration {String(index + 1).padStart(2, '0')}</span>
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-sm border border-ew-rule bg-ew-paper p-0.5" role="group" aria-label={`Apply consideration ${index + 1}`}>
          {[true, false].map(enabled => <button key={String(enabled)} type="button" aria-pressed={c.enabled === enabled} onClick={() => onChange({ enabled })} className={`rounded-sm px-3 py-1 text-xs font-medium focus-visible:outline-ew-focus ${c.enabled === enabled ? 'bg-ew-ink text-white' : 'text-ew-muted hover:text-ew-ink'}`}>{enabled ? 'Apply' : 'Skip'}</button>)}
        </div>
        <button type="button" onClick={onRemove} aria-label={`Remove consideration ${index + 1}`} className="rounded-sm p-1 text-ew-muted hover:bg-ew-paper hover:text-ew-ink focus-visible:outline-ew-focus"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
    </div>
    <div className="p-4">
      <label htmlFor={`text-${c.id}`} className="mb-2 block text-sm font-medium">What should this run consider?</label>
      <textarea id={`text-${c.id}`} rows={2} maxLength={600} className={`${field} resize-y leading-relaxed`} value={c.text} onChange={e => onChange({ text: e.target.value })} placeholder="Verify whether the lawsuit concerns this company or its parent." />
      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs text-ew-muted focus-visible:outline-ew-focus">
          <span className="flex items-center gap-1.5"><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />Scope &amp; checks</span>
          <span className="text-right">{c.mode === 'exclude' ? 'Exclude' : CHECK_NAMES[c.check]} · {c.signal_ids.length ? `${c.signal_ids.length} selected` : c.mode === 'exclude' ? 'Select evidence' : 'All evidence'}</span>
        </summary>
        <div className="mt-3 border-t border-ew-rule-soft pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-ew-ink-soft">Action<select className={`${field} mt-1`} value={c.mode} onChange={e => onChange({ mode: e.target.value })}><option value="consider">Review evidence</option><option value="exclude">Exclude evidence</option></select></label>
            <label className="text-xs font-medium text-ew-ink-soft">Check<select className={`${field} mt-1`} value={c.check} onChange={e => onChange({ check: e.target.value })}>{Object.entries(CHECK_NAMES).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
          </div>
          <p className="mb-2 mt-4 text-xs text-ew-muted">{c.mode === 'exclude' ? 'Choose the evidence to exclude. Its source stays in the audit report.' : 'Leave unselected to review all evidence, or choose specific items.'}</p>
          <div className="divide-y divide-ew-rule-soft rounded-sm border border-ew-rule-soft">{signals.map(s => <label key={s.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-ew-hover"><input className="mt-0.5 h-4 w-4 shrink-0 accent-ew-ink" type="checkbox" checked={c.signal_ids.includes(s.id)} onChange={e => onChange({ signal_ids: e.target.checked ? [...c.signal_ids, s.id] : c.signal_ids.filter(id => id !== s.id) })} /><span>{s.title}</span></label>)}</div>
          {!signals.length && <p className="text-xs text-ew-muted">No evidence recorded yet.</p>}
        </div>
      </details>
    </div>
  </fieldset>;
}
