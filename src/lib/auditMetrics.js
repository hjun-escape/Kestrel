// Accuracy is the reviewer's assessment of claims, never a proxy from automated checks.
// This is a transparent check-pass heuristic, not calibrated claim accuracy or lending risk.
export function checkConfidence(tests = []) {
  const total = tests.length;
  const passed = tests.filter(t => t.verdict === 'pass').length;
  const failed = tests.filter(t => t.verdict === 'fail').length;
  return { percent: total ? Math.round(passed / total * 100) : null, passed, failed, unresolved: total - passed - failed, total };
}

export function reviewerAccuracy(decisions = [], signals = []) {
  const validIds = new Set(signals.map(s => s.id));
  const assessments = new Map();
  decisions.forEach(d => { if (validIds.has(d.signal_id)) assessments.set(d.signal_id, d.decision); });
  const confirmed = [...assessments.values()].filter(d => d === 'confirmed').length;
  const incorrect = [...assessments.values()].filter(d => d === 'incorrect').length;
  const assessed = confirmed + incorrect;
  return { percent: assessed ? Math.round(confirmed / assessed * 100) : null, confirmed, incorrect, assessed, unassessed: validIds.size - assessed, total: validIds.size };
}

// Colour for a check-based confidence percent (always shown with its number, never colour alone).
export function confidenceTone(percent) {
  if (percent == null) return 'border-ew-rule bg-ew-none-bg text-ew-none';
  if (percent >= 80) return 'border-ew-green-rule bg-ew-green-bg text-ew-green';
  if (percent >= 50) return 'border-ew-amber-rule bg-ew-amber-bg text-ew-amber';
  return 'border-ew-red-rule bg-ew-red-bg text-ew-red';
}

// Colour for one check's results: any fail red, any unresolved amber, all passed green.
export function checkTone(results = []) {
  if (!results.length) return 'none';
  if (results.some(t => t.verdict === 'fail')) return 'red';
  if (results.some(t => t.verdict !== 'pass')) return 'amber';
  return 'green';
}
