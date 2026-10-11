import { base44 } from "./base44Client";

// Every screen read goes through the readData backend function: the entities are closed to
// clients (rls), and readData applies the per-user rule (base44/functions/readData).
export async function listRecords(entity, query = {}, sort, limit) {
  const res = await base44.functions.invoke("readData", { entity, query, sort, limit });
  return res?.data?.items ?? [];
}

// Throws like the SDK did (error.response.status === 404) when the record is missing or not the viewer's.
export async function getRecord(entity, id) {
  const res = await base44.functions.invoke("readData", { entity, id });
  return res?.data?.item ?? null;
}
