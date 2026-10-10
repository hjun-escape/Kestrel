// Export every company in the shared demo book to data/cache/<id>.json (the
// "sample JSON for every company" submission deliverable in docs/PLAN.md),
// plus data/cache/index.json listing them.
//
// Run: node scripts/export-cache.mjs [--include-samples]
//
// Reads the published app's public API the way a signed-out visitor does, so
// it needs no keys and only sees the shared demo book. Sample companies (made-up
// data on the .example domain) are skipped unless --include-samples is given.
// Internal fields (owner, pending Bright Data snapshot ids, audit fields) are
// left out. Re-run it just before submitting so the files match the live app.

import { mkdir, readdir, rm, writeFile } from "node:fs/promises";

const APP_URL = "https://early-warning-5bc4fabd.base44.app";
const APP_ID = "6aca96c9744d6ba75bc4fabd";
const OUT_DIR = new URL("../data/cache/", import.meta.url);
const includeSamples = process.argv.includes("--include-samples");

const BORROWER_FIELDS = [
  "id", "name", "website_domain", "hq_city", "hq_state", "industry", "stage", "loan_amount_usd",
  "linkedin_url", "glassdoor_url", "status", "why", "last_refreshed", "sources_unavailable",
];
const SIGNAL_FIELDS = ["id", "type", "severity", "date", "title", "snippet", "source_name", "source_url"];

async function list(entity) {
  const res = await fetch(`${APP_URL}/api/apps/${APP_ID}/entities/${entity}?limit=500`);
  if (!res.ok) throw new Error(`${entity}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return Array.isArray(body) ? body : body.items || [];
}

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj[f] ?? null]));
const isSample = (b) => /\.example$/i.test(String(b.website_domain || "").trim());

const [borrowers, signals] = await Promise.all([list("Borrower"), list("Signal")]);
const companies = borrowers
  .filter((b) => includeSamples || !isSample(b))
  .sort((a, b) => a.name.localeCompare(b.name));

await mkdir(OUT_DIR, { recursive: true });
// Start clean so companies removed from the book do not linger.
for (const f of await readdir(OUT_DIR)) if (f.endsWith(".json")) await rm(new URL(f, OUT_DIR));

const exportedAt = new Date().toISOString();
const index = [];
for (const b of companies) {
  const own = signals
    .filter((s) => s.borrower_id === b.id)
    .sort((x, y) => String(y.date).localeCompare(String(x.date)) || String(x.title).localeCompare(String(y.title)))
    .map((s) => pick(s, SIGNAL_FIELDS));
  const record = {
    exported_at: exportedAt,
    source: `${APP_URL}/borrower/${b.id}`,
    sample_data: isSample(b),
    borrower: pick(b, BORROWER_FIELDS),
    signals: own,
  };
  await writeFile(new URL(`${b.id}.json`, OUT_DIR), JSON.stringify(record, null, 2) + "\n");
  index.push({ id: b.id, name: b.name, stage: b.stage, status: b.status, why: b.why, signals: own.length, file: `${b.id}.json` });
}
await writeFile(new URL("index.json", OUT_DIR), JSON.stringify({ exported_at: exportedAt, companies: index }, null, 2) + "\n");

console.log(`Exported ${index.length} companies to data/cache/ (${includeSamples ? "including" : "skipping"} sample companies).`);
for (const c of index) console.log(`  ${c.status?.padEnd(6)} ${c.stage?.padEnd(9)} ${c.name} (${c.signals} signals)`);
