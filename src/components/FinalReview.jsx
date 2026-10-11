import React, { useState } from 'react';
import { ChevronRight, CircleAlert, CircleCheck, Circle, ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { warningScore } from '@/lib/warningScore.ts';
import { Dialog, DialogContent as SharedDialogContent, DialogTitle as SharedDialogTitle, DialogDescription as SharedDialogDescription } from '@/components/ui/dialog';
import { checkConfidence } from '@/lib/auditMetrics';
import { DocumentPassages } from '@/components/ContextDocuments';

// Final review: the officer's manual confirmation, after the audit. A checklist built from the stored records,
// a Confirm / Incorrect / Uncertain call on every flag, and a sign-off with an outcome and note. Signing off
// saves a new audit version that records who signed, when, and what they decided. It never changes the status.

export const OUTCOMES = [
  ['proceed', 'Proceed', 'Evidence reviewed; nothing blocks the next step.'],
  ['proceed_with_conditions', 'Proceed with conditions', 'Go ahead only with the conditions in the note.'],
  ['request_documents', 'Request documents first', 'Hold until the company sends what the note lists.'],
  ['decline', 'Decline', 'The evidence does not support lending.'],
];
const OUTCOME_LABEL = Object.fromEntries(OUTCOMES.map(([k, l]) => [k, l]));
const OUTCOME_TONE = { proceed: 'border-ew-green-rule bg-ew-green-bg text-ew-green', proceed_with_conditions: 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber', request_documents: 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber', decline: 'border-ew-red-rule bg-ew-red-bg text-ew-red' };
const CALLS = [['confirmed', 'Confirm', 'border-ew-green-rule bg-ew-green-bg text-ew-green'], ['incorrect', 'Incorrect', 'border-ew-red-rule bg-ew-red-bg text-ew-red'], ['uncertain', 'Uncertain', 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber']];
const DialogContent = /** @type {React.ComponentType<any>} */ (SharedDialogContent);
const DialogTitle = /** @type {React.ComponentType<any>} */ (SharedDialogTitle);
const DialogDescription = /** @type {React.ComponentType<any>} */ (SharedDialogDescription);
const CALL_CHIP = { confirmed: ['Confirmed', 'border-ew-green-rule bg-ew-green-bg text-ew-green'], incorrect: ['Incorrect', 'border-ew-red-rule bg-ew-red-bg text-ew-red'], uncertain: ['Uncertain', 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber'], none: ['Not reviewed', 'border-ew-rule bg-ew-none-bg text-ew-none'] };
const BAND = { red: 'Red', yellow: 'Yellow', green: 'Green' };
const BAND_TONE = { red: 'text-ew-red', yellow: 'text-ew-amber', green: 'text-ew-green' };
const field = 'w-full rounded-sm border border-ew-rule bg-ew-surface px-3 py-2 text-sm focus-visible:outline-ew-focus';

function Item({ state, title, detail }) {
  const Icon = state === 'done' ? CircleCheck : state === 'warn' ? CircleAlert : Circle;
  const tone = state === 'done' ? 'text-ew-green' : state === 'warn' ? 'text-ew-amber' : 'text-ew-muted';
  return (
    <li className="flex items-start gap-2.5 py-2">
      <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <div>
        <p className="text-sm font-medium">
          {title} <span className={`ml-1 text-xs font-semibold ${tone}`}>{state === 'done' ? 'Done' : state === 'warn' ? 'Check' : 'To do'}</span>
        </p>
        <p className="text-xs text-ew-muted">{detail}</p>
      </div>
    </li>
  );
}

export default function FinalReview({ borrower, signals, payload, stale, historical, decisions, onDecision, busy, canRun, onRunAudit, onSignoff, latestSignoff }) {
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  if (!payload) {
    return (
      <div className="flex flex-col items-start gap-3 py-2">
        <p className="text-sm text-ew-muted">Run an audit first. The final review confirms the audited evidence, flag by flag, and records your sign-off.</p>
        <button type="button" onClick={onRunAudit} disabled={!canRun} className="inline-flex h-9 items-center gap-2 rounded-sm bg-ew-ink px-3.5 text-sm font-semibold text-white disabled:opacity-50"><ShieldCheck aria-hidden="true" className="h-4 w-4" />Audit this report</button>
      </div>
    );
  }

  const confidence = checkConfidence(payload.tests);
  const callOf = id => decisions.find(d => d.signal_id === id);
  const assessed = signals.filter(s => ['confirmed', 'incorrect'].includes(callOf(s.id)?.decision)).length;
  const unavailable = borrower.sources_unavailable || [];
  const docs = payload.documents || [];
  const passagesOf = id => (payload.document_context || []).find(c => c.signal_id === id)?.passages || [];
  const allAssessed = assessed === signals.length;
  const incorrectIds = signals.filter(s => callOf(s.id)?.decision === 'incorrect').map(s => s.id);
  const scoreNow = warningScore(signals);
  const scoreAfter = warningScore(signals.filter(s => !incorrectIds.includes(s.id)));
  const ready = !stale && !historical && allAssessed && !!outcome && (outcome === 'proceed' || note.trim());

  function submit() {
    setError('');
    if (!outcome) return setError('Choose a final outcome.');
    if (outcome !== 'proceed' && !note.trim()) return setError('Add a note explaining the outcome.');
    onSignoff({ outcome, note });
  }

  return (
    <div className="space-y-6">
      {latestSignoff && (
        <div className={`rounded-sm border px-4 py-3 ${OUTCOME_TONE[latestSignoff.outcome]}`}>
          <p className="text-sm font-semibold">Signed off: {OUTCOME_LABEL[latestSignoff.outcome]}</p>
          <p className="mt-0.5 text-xs">{latestSignoff.by} · {new Date(latestSignoff.at).toLocaleString()}</p>
          {latestSignoff.note && <p className="mt-1.5 text-sm text-ew-ink">{latestSignoff.note}</p>}
        </div>
      )}

      <section aria-labelledby="final-checklist">
        <h3 id="final-checklist" className="text-sm font-semibold">Before you sign</h3>
        <ul className="mt-1 divide-y divide-ew-rule-soft">
          <Item state={borrower.last_refreshed && !unavailable.length ? 'done' : 'warn'} title="Sources checked" detail={!borrower.last_refreshed ? 'This company has not been checked.' : unavailable.length ? `${unavailable.join(', ')} did not answer. The status rests on the other sources.` : 'Every source answered in the last check.'} />
          <Item state={stale ? 'warn' : 'done'} title="Audit covers the current report" detail={stale ? 'The report changed after this audit. Run the audit again.' : `Check-based confidence ${confidence.percent ?? 0}% · ${confidence.passed}/${confidence.total} checks passed.`} />
          <Item state={allAssessed ? 'done' : 'todo'} title="Every flag confirmed or rejected" detail={`${assessed} of ${signals.length} flags called. Uncertain flags need a decision before you sign.`} />
          <Item state={(payload.accepted_documents || []).length ? 'done' : 'todo'} title="Documents exchanged and reviewed (optional)" detail={(payload.accepted_documents || []).length ? `${payload.accepted_documents.length} accepted document${payload.accepted_documents.length === 1 ? '' : 's'} used in this audit: ${payload.accepted_documents.map(d => d.name).join(', ')}.` : 'None accepted yet. Request or add documents in the Documents tab, then run the audit again.'} />
          <Item state={docs.length ? 'done' : 'todo'} title="Context documents considered (optional)" detail={docs.length ? docs.map(d => d.name).join(', ') : 'None added. Add them in Rerun with considerations.'} />
        </ul>
      </section>

      <section aria-labelledby="final-flags">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="final-flags" className="text-sm font-semibold">Flags · {assessed} of {signals.length} called</h3>
          <p className="text-xs">
            Warning score <span className={`font-semibold ${BAND_TONE[scoreNow.band]}`}>{scoreNow.score} {BAND[scoreNow.band]}</span>
            {incorrectIds.length > 0 && (
              <>
                {' '}→ <span className={`font-semibold ${BAND_TONE[scoreAfter.band]}`}>{scoreAfter.score} {BAND[scoreAfter.band]}</span> without the {incorrectIds.length} flag{incorrectIds.length === 1 ? '' : 's'} you marked incorrect
              </>
            )}
          </p>
        </div>
        {signals.length === 0 && <p className="mt-2 text-sm text-ew-muted">No flags in this report. A clean check does not prove there is no risk.</p>}
        <ul className="mt-2 divide-y divide-ew-rule-soft border border-ew-rule">
          {signals.map(s => {
            const c = callOf(s.id);
            const [label, tone] = CALL_CHIP[c?.decision] || CALL_CHIP.none;
            const tests = payload.tests.filter(t => t.signal_id === s.id);
            const fails = tests.filter(t => t.verdict === 'fail').length;
            const reviews = tests.filter(t => t.verdict === 'needs_review').length;
            return (
              <li key={s.id}>
                <button type="button" onClick={() => setOpenId(s.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-ew-hover">
                  <span className={`shrink-0 rounded-sm border px-1.5 text-[11px] font-semibold leading-[18px] ${tone}`}>{label}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                  <span className="hidden shrink-0 gap-2 text-xs sm:flex">
                    <span className={fails ? 'text-ew-red' : 'text-ew-muted'}>{fails} failed</span>
                    <span className={reviews ? 'text-ew-amber' : 'text-ew-muted'}>{reviews} to review</span>
                  </span>
                  <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-ew-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <FlagModal
        signal={signals.find(s => s.id === openId) || null}
        payload={payload}
        call={callOf(openId)}
        passages={passagesOf(openId)}
        signals={signals}
        incorrectIds={incorrectIds}
        disabled={busy || stale || historical}
        onDecision={onDecision}
        onClose={() => setOpenId(null)}
      />

      <section aria-labelledby="final-signoff" className="border-t border-ew-rule pt-4">
        <h3 id="final-signoff" className="text-sm font-semibold">Sign off</h3>
        <fieldset className="mt-2 grid gap-2 sm:grid-cols-2" disabled={busy || stale || historical}>
          <legend className="sr-only">Final outcome</legend>
          {OUTCOMES.map(([value, label, hint]) => (
            <label key={value} className={`flex cursor-pointer items-start gap-2.5 rounded-sm border p-3 ${outcome === value ? OUTCOME_TONE[value] : 'border-ew-rule hover:bg-ew-hover'}`}>
              <input type="radio" name="final-outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} className="mt-0.5 accent-ew-ink" />
              <span>
                <span className="block text-sm font-semibold text-ew-ink">{label}</span>
                <span className="block text-xs text-ew-muted">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <label htmlFor="final-note" className="mt-3 block text-xs font-semibold">Note {outcome && outcome !== 'proceed' ? '(required)' : '(optional)'}</label>
        <textarea id="final-note" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} disabled={busy || stale || historical} className={`${field} mt-1`} placeholder="Conditions, documents to request, or why you declined." />
        {error && <p role="alert" className="mt-2 text-sm text-ew-red">{error}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={!ready || busy} className="inline-flex h-9 items-center gap-2 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white disabled:opacity-50">
            {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}Sign off
          </button>
          <p className="text-xs text-ew-muted">{!allAssessed ? `Confirm or reject the ${signals.length - assessed} remaining flag${signals.length - assessed === 1 ? '' : 's'} first.` : 'Saved as a new audit version with your name and time. The status does not change.'}</p>
        </div>
      </section>
    </div>
  );
}

/** One flag's call: the evidence, then Confirm / Incorrect / Uncertain with a reason, and the score without it. */
function FlagModal({ signal: s, payload, call, passages, signals, incorrectIds, disabled, onDecision, onClose }) {
  if (!s) return null;
  const tests = payload.tests.filter(t => t.signal_id === s.id);
  const withThis = incorrectIds.filter(id => id !== s.id);
  const before = warningScore(signals.filter(x => !withThis.includes(x.id)));
  const after = warningScore(signals.filter(x => !withThis.includes(x.id) && x.id !== s.id));
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto rounded-sm border-ew-rule bg-ew-surface text-ew-ink sm:max-w-2xl sm:rounded-sm">
        <DialogTitle className="font-heading text-lg font-bold leading-snug">{s.title}</DialogTitle>
        <DialogDescription className="text-xs text-ew-muted">
          {s.date} · {s.severity}
          {s.source_url && (
            <>
              {' · '}
              <a href={s.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">{s.source_name || 'Source'}<ExternalLink aria-hidden="true" className="h-3 w-3" /><span className="sr-only"> (opens in a new tab)</span></a>
            </>
          )}
        </DialogDescription>
        {s.snippet && <blockquote className="border-l-2 border-ew-rule pl-3 text-sm text-ew-ink-soft">“{s.snippet}”</blockquote>}
        <DocumentPassages passages={passages} />
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-semibold">Audit checks ({tests.length})</summary>
          <ul className="mt-2 space-y-1">
            {tests.map(t => (
              <li key={t.id} className="flex items-start justify-between gap-3 text-xs">
                <span><span className="font-medium">{t.title}: </span><span className="text-ew-muted">{t.actual}</span></span>
                <span className={`shrink-0 font-semibold ${t.verdict === 'pass' ? 'text-ew-green' : t.verdict === 'fail' ? 'text-ew-red' : 'text-ew-amber'}`}>{t.verdict === 'pass' ? 'Pass' : t.verdict === 'fail' ? 'Fail' : 'Review'}</span>
              </li>
            ))}
          </ul>
        </details>
        <div>
          <p className="text-sm font-semibold">Your call</p>
          <div className="mt-2 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Your call on this flag">
            {CALLS.map(([value, label, on]) => (
              <button key={value} type="button" role="radio" aria-checked={call?.decision === value} disabled={disabled} onClick={() => onDecision(s.id, { decision: value })} className={`rounded-sm border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${call?.decision === value ? on : 'border-ew-rule hover:bg-ew-hover'}`}>{label}</button>
            ))}
          </div>
          {call?.decision === 'incorrect' && (
            <p className="mt-2 text-sm">
              Warning score <span className={`font-semibold ${BAND_TONE[before.band]}`}>{before.score} {BAND[before.band]}</span> → <span className={`font-semibold ${BAND_TONE[after.band]}`}>{after.score} {BAND[after.band]}</span> without this flag. Signing off records it; the company's status itself does not change.
            </p>
          )}
        </div>
        <label className="block text-sm font-semibold">Reason
          <textarea rows={2} maxLength={1000} value={call?.note || ''} disabled={disabled} onChange={e => onDecision(s.id, { note: e.target.value })} placeholder="What you checked, and why" className={`${field} mt-1 font-normal`} />
        </label>
        <button type="button" onClick={onClose} className="h-9 rounded-sm bg-ew-ink px-4 text-sm font-semibold text-white">Done</button>
      </DialogContent>
    </Dialog>
  );
}
