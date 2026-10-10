// Local test page for P2 newsSignals. Dev only: not deployed, not part of the Base44 app.
// Runs the exact backend code (base44/functions/newsSignals) and streams each step to the page.
//   deno run -A --env-file=.env dev/news-console/server.ts   then open http://localhost:8044
// - Base44's built-in LLM is not reachable locally, so Gemini (GEMINI_API_KEY in .env) stands in for it.
// - Every Bright Data response is recorded to dev/fixtures/<id>.news.json; "saved" runs replay it (no credit used).
import { runNewsSignals, type LLMParams } from "../../base44/functions/newsSignals/logic.ts";
import { normaliseSerpJson } from "../../base44/functions/newsSignals/shared.ts";
import { crawlLinkedIn, type LinkedInRun, linkedInSignals } from "../../base44/functions/newsSignals/linkedin.ts";

type Borrower = { id?: string; name: string; website_domain?: string; hq_city?: string; hq_state?: string };
const COMPANIES: Borrower[] = JSON.parse(await Deno.readTextFile("dev/companies.json"));
const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));
const exists = (p: string) => Deno.stat(p).then(() => true, () => false);
const secs = (t: number) => (performance.now() - t) / 1000;
const newsFixture = (id: string) => `dev/fixtures/${id}.news.json`;
const liFixture = (id: string) => `dev/fixtures/${id}.linkedin.json`;

// The free Gemini tier rate-limits parallel calls, so the local stand-in runs one call at a time and retries 429s.
let geminiQueue: Promise<unknown> = Promise.resolve();
function gemini(params: LLMParams): Promise<unknown> {
  const run = geminiQueue.then(() => geminiOnce(params, 0));
  geminiQueue = run.catch(() => {});
  return run;
}

async function geminiOnce({ prompt, response_json_schema }: LLMParams, attempt: number): Promise<unknown> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not set in .env");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: `${prompt}\n\nReturn only JSON matching this JSON Schema:\n${JSON.stringify(response_json_schema)}` }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
    return geminiOnce({ prompt, response_json_schema }, attempt + 1);
  }
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}");
}

type Search = { type: string; query: string; results: { title: string; url: string; source: string; date: string; snippet: string }[] };
type Read = { url: string; ok: boolean; chars: number; cached: boolean };
type TagRow = { url: string; title: string; tag: unknown; decision?: string; reason?: string };

async function runNews(b: Borrower, live: boolean, log: (m: string) => void) {
  const saved = !live && await exists(newsFixture(b.id!)) ? JSON.parse(await Deno.readTextFile(newsFixture(b.id!))) : null;
  const responses: Record<string, string> = saved?.responses ?? {};
  const today: string = saved?.today ?? new Date().toISOString().slice(0, 10);
  log(saved ? `Replaying Bright Data responses saved ${saved.recorded_at.slice(0, 16)}; no credit used.` : "Live: calling Bright Data.");

  const searches: Search[] = [];
  const reads: Read[] = [];
  const tags: TagRow[] = [];
  const t0 = performance.now();

  // Record/replay every Bright Data call, and note what each one was (search or article read).
  const recordingFetch = async (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => {
    const target = String(JSON.parse(init.body).url);
    let text = responses[target];
    const cached = text !== undefined;
    if (!cached) {
      const res = await fetch(url, init);
      text = await res.text();
      if (res.ok && text.trim()) responses[target] = text; // never save an empty blip, or replays would repeat it
      else return { ok: false, status: res.status, text: async () => text };
    }
    if (target.includes("google.com/search")) {
      const q = decodeURIComponent(new URL(target).searchParams.get("q") ?? "");
      let results: Search["results"] = [];
      try {
        results = normaliseSerpJson(JSON.parse(text));
      } catch { /* unreadable: the pipeline reports it */ }
      searches.push({ type: /CEO|CFO/.test(q) ? "exec_departure" : "legal_layoffs", query: q, results });
    } else reads.push({ url: target, ok: true, chars: text.length, cached });
    return { ok: true, status: 200, text: async () => text };
  };

  const recordingLLM = async (params: LLMParams) => {
    const url = params.prompt.match(/^URL: (.*)$/m)?.[1] ?? "";
    const title = params.prompt.match(/^Title: (.*)$/m)?.[1] ?? "";
    const row: TagRow = { url, title, tag: null };
    tags.push(row);
    row.tag = await gemini(params);
    return row.tag;
  };

  const pipelineLog = (m: string) => {
    log(m);
    const d = m.match(/^(KEEP|drop|fail) (.*?) -> (.*?)(?: \| model: "(.*)")?(?: \(article not readable.*\))?$/);
    if (d) {
      const row = tags.find((t) => t.title.slice(0, 80) === d[2] && !t.decision);
      if (row) Object.assign(row, { decision: d[1], reason: d[3] });
    }
  };

  const signals = await runNewsSignals({
    borrower: b as { name: string },
    invokeLLM: recordingLLM,
    fetch: recordingFetch,
    apiKey: Deno.env.get("BRIGHTDATA_API_KEY") ?? "replay",
    today,
    log: pipelineLog,
  });
  if (!saved || live) {
    await Deno.mkdir("dev/fixtures", { recursive: true });
    await Deno.writeTextFile(newsFixture(b.id!), JSON.stringify({ recorded_at: new Date().toISOString(), today, responses }) + "\n");
  }
  return { searches, reads, tags, signals, seconds: secs(t0), live: !saved };
}

async function runAll(body: { company: Borrower; live: boolean; linkedin: boolean }, emit: (o: unknown) => void) {
  const t0 = performance.now();
  const logger = (lane: string) => (msg: string) => emit({ type: "log", lane, msg, t: secs(t0) });
  const known = COMPANIES.find((c) => c.id === body.company.id);
  const b: Borrower = known ?? { ...body.company, id: body.company.id || body.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") };

  const li = body.linkedin
    ? (async () => {
      const log = logger("linkedin"), tl = performance.now();
      try {
        let run: LinkedInRun, live = false;
        if (!body.live && await exists(liFixture(b.id!))) {
          run = JSON.parse(await Deno.readTextFile(liFixture(b.id!))).run;
          log("Using saved LinkedIn results; no Bright Data credit used.");
        } else {
          run = await crawlLinkedIn(b, { fetch, apiKey: Deno.env.get("BRIGHTDATA_API_KEY") ?? "", invokeLLM: gemini }, log);
          live = true;
          await Deno.mkdir("dev/fixtures", { recursive: true });
          await Deno.writeTextFile(liFixture(b.id!), JSON.stringify({ recorded_at: new Date().toISOString(), run }, null, 1) + "\n");
        }
        const res = linkedInSignals(b, run, new Date());
        for (const c of res.checks) log(`D. ${c.exec}: ${c.result} (${c.detail})`);
        return { run, live, ...res, seconds: secs(tl) };
      } catch (e) {
        log(`LinkedIn failed: ${(e as Error).message}`);
        return { error: `LinkedIn: ${(e as Error).message}`, seconds: secs(tl) };
      }
    })()
    : Promise.resolve(null);

  const [n, l] = await Promise.all([runNews(b, body.live, logger("news")), li]);
  const signals = [...n.signals, ...((l && "signals" in l && l.signals) || [])].sort((a, z) => z.date.localeCompare(a.date));
  emit({ type: "result", borrower: b, news: n, linkedin: l, signals });
}

Deno.serve({ port: 8044 }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname === "/companies") return Response.json(COMPANIES);
  if (url.pathname === "/run" && req.method === "POST") {
    const body = await req.json();
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(ctl) {
        const emit = (o: unknown) => ctl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
        try {
          await runAll(body, emit);
        } catch (e) {
          emit({ type: "error", error: (e as Error).message });
        }
        ctl.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
  }
  return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
});
