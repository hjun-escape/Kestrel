import { base44 } from "@/api/base44Client";
import { SEED_COMPANIES } from "./seedData";

// Seeds the database from seedData.js on first load (when no borrowers exist).
// Idempotent and guarded against concurrent calls.
let seedingPromise = null;

export async function ensureSeedData() {
  if (seedingPromise) return seedingPromise;
  seedingPromise = (async () => {
    try {
      const count = await base44.entities.Borrower.count({});
      if (count > 0) return;

      const borrowers = await base44.entities.Borrower.bulkCreate(
        SEED_COMPANIES.map((c) => ({
          name: c.name,
          website_domain: c.website_domain,
          hq_city: c.hq_city,
          hq_state: c.hq_state,
          industry: c.industry,
          stage: c.stage,
          loan_amount_usd: c.loan_amount_usd,
          linkedin_url: c.linkedin_url,
          glassdoor_url: c.glassdoor_url,
          status: c.status,
          why: c.why,
          last_refreshed: c.last_refreshed,
          sources_unavailable: c.sources_unavailable || [],
        }))
      );

      const domainToId = {};
      borrowers.forEach((b) => {
        domainToId[b.website_domain] = b.id;
      });

      const allSignals = [];
      SEED_COMPANIES.forEach((c) => {
        const borrowerId = domainToId[c.website_domain];
        if (!borrowerId) return;
        (c.signals || []).forEach((s) => {
          allSignals.push({ ...s, borrower_id: borrowerId });
        });
      });

      if (allSignals.length > 0) {
        await base44.entities.Signal.bulkCreate(allSignals);
      }
    } catch (e) {
      seedingPromise = null; // allow a retry on the next load
      throw e;
    }
  })();
  return seedingPromise;
}