// P3 lookup: find the Bright Data dataset IDs and field names for jobs and Glassdoor reviews (PLAN.md §8).
// Run: node --env-file=.env scripts/brightdata-datasets.mjs [search words...]
// Default search: "linkedin job", "indeed", "glassdoor". Needs BRIGHTDATA_API_KEY in .env (never commit it).

const key = process.env.BRIGHTDATA_API_KEY;
if (!key) {
  console.error("Set BRIGHTDATA_API_KEY in .env");
  process.exit(1);
}
const get = async (path) => {
  const res = await fetch(`https://api.brightdata.com${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
};

const terms = process.argv.length > 2 ? process.argv.slice(2) : ["linkedin job", "indeed", "glassdoor"];
const datasets = await get("/datasets/list");
for (const term of terms) {
  const words = term.toLowerCase().split(/\s+/);
  const hits = datasets.filter((d) => words.every((w) => String(d.name).toLowerCase().includes(w)));
  console.log(`\n## "${term}": ${hits.length} match(es)`);
  for (const d of hits) {
    console.log(`- ${d.id}  ${d.name}`);
    try {
      const meta = await get(`/datasets/${d.id}/metadata`);
      console.log(`  fields: ${Object.keys(meta.fields ?? meta).join(", ")}`);
    } catch (e) {
      console.log(`  (no metadata: ${e.message})`);
    }
  }
}
