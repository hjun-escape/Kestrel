import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { POLL_INTERVAL_MS, devinErrorMessage, isActiveRun, pollExpired } from './devinRunUtils';

const call = async body => (await base44.functions.invoke('devinRun', body)).data;

// Loads the latest independent_audit run, starts new ones and polls active ones.
export function useDevinAudit(borrowerId, enabled) {
  const [run, setRun] = useState(null);
  const [loading, setLoading] = useState(!!enabled);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const [now, setNow] = useState(Date.now());
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    setRun(null); setError(''); setTimedOut(false);
    if (!enabled || !borrowerId) { setLoading(false); return undefined; }
    let active = true;
    setLoading(true);
    call({ action: 'list', borrower_id: borrowerId })
      .then(data => { if (active) setRun((data.runs || []).find(r => r.kind === 'independent_audit') || null); })
      .catch(e => { if (active) setError(devinErrorMessage(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [borrowerId, enabled]);

  const runId = run?.id;
  const active = isActiveRun(run) && !timedOut;
  useEffect(() => {
    if (!active || !runId) return undefined;
    const timer = setInterval(async () => {
      setNow(Date.now());
      if (pollExpired(run)) { setTimedOut(true); return; }
      try {
        const data = await call({ action: 'poll', run_id: runId });
        if (alive.current && data?.run) setRun(data.run);
      } catch (e) { if (alive.current) setError(devinErrorMessage(e)); }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = useCallback(async () => {
    setStarting(true); setError(''); setTimedOut(false);
    try {
      const data = await call({ action: 'start', borrower_id: borrowerId, kind: 'independent_audit' });
      if (data?.run) setRun(data.run);
    } catch (e) {
      setError(devinErrorMessage(e));
      if (e?.response?.data?.run) setRun(e.response.data.run);
    } finally { if (alive.current) setStarting(false); }
  }, [borrowerId]);

  return { run, loading, starting, error, timedOut, now, active, start };
}
