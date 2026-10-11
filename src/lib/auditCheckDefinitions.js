export const AUDIT_CHECKS = [
  { key: 'identity', title: 'Company identity', why: 'Prevents a similarly named company’s news from affecting this report.' },
  { key: 'quote', title: 'Source evidence', why: 'Checks whether a usable source and quote exist. Stored snippets alone cannot verify the full source text.' },
  { key: 'support', title: 'Claim support', why: 'Checks whether the evidence supports the claim. Without independent verification, these findings remain unresolved.' },
  { key: 'freshness', title: 'Dates & freshness', why: 'Keeps invalid, future or out-of-window events from being treated as current risk.' },
  { key: 'duplicates', title: 'Duplicate signals', why: 'Prevents the same event from inflating the report by being counted twice.' },
  { key: 'score', title: 'Score consistency', why: 'Recalculates the fixed rules to check whether the recorded risk status matches the evidence.' },
];
