// Local test page for P2 newsSignals. Dev only: not deployed, not part of the Base44 app.
// Runs the exact backend code (base44/functions/newsSignals) and streams each step.
// Base44's built-in LLM is not reachable locally, so Gemini (GEMINI_API_KEY in .env) stands in for it.
//   deno run -A --env-file=.env dev/news-console/server.ts   then open http://localhost:8044
import { crawlNews, type LLMParams, type NewsBatch, signalsFromBatches } from "../../base44/functions/newsSignals/logic.ts";
import { crawlLinkedIn, type LinkedInRun, linkedInSignals } from "../../base44/functions/newsSignals/linkedin.ts";

type Borrower = { id?: string; name: string; website_domain?: string; hq_city?: string; hq_state?: string };
const COMPANIES: Borrower[] = JSON.parse(await Deno.readTextFile("dev/companies.json"));
const page = await Deno.readTextFile(new URL("./index.html", import.meta.url));
const exists = (p: string) => Deno.stat(p).then(() => true, () => false);
const secs = (t: number) => (performance.now() - t) / 1000;
const newsFixture = (id: string) => `tests/fixtures/news-${id}.json`;
const liFixture = (id: string) => `dev/fixtures/${id}.linkedin.json`;

async function gemini({ prompt, response_json_schema }: LLMParams): Promise<unknown> {
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
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return JSON.parse(data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}");
}

const deps = () => ({ fetch, apiKey: Deno.env.get("BRIGHTDATA_API_KEY") ?? "", zone: Deno.env.get("BRIGHTDATA_SERP_ZONE") ?? "mcp_unlocker", invokeLLM: gemini });

async function runAll(body: { company: Borrower; live: boolean; linkedin: boolean }, emit: (o: unknown) => void) {
  const t0 = performance.now();
  const logger = (lane: string) => (msg: string) => emit({ type: "log", lane, msg, t: secs(t0) });
  const newsLog = logger("news"), liLog = logger("linkedin");
  const known = COMPANIES.find((c) => c.id === body.company.id);
  const b: Borrower = known ?? { ...body.company, id: body.company.id || body.company.name.toLowerCase().replace(/[^a-z0-9]+/g, "") };
  const live = body.live || !(await exists(newsFixture(b.id!)));

  const news = (async () => {
    const tc = performance.now();
    let batches: NewsBatch[], today = new Date();
    if (live) {
      newsLog("1. Crawl: 2 Google News searches via Bright Data...");
      batches = await crawlNews(b, deps(), newsLog);
      await Deno.writeTextFile(newsFixture(b.id!), JSON.stringify({ recorded_at: new Date().toISOString(), batches }, null, 1) + "\n");
    } else {
      const f = JSON.parse(await Deno.readTextFile(newsFixture(b.id!)));
      batches = f.batches;
      today = new Date(f.recorded_at);
      newsLog(`1. Crawl: using saved results from ${f.recorded_at.slice(0, 10)}; no Bright Data credit used.`);
    }
    const crawl_s = secs(tc);
    const ta = performance.now();
    const { signals, trace } = await signalsFromBatches(b, batches, gemini, today, newsLog);
    return { batches, signals, trace, timings: { crawl_s, analyze_s: secs(ta) } };
  })();

  const li = body.linkedin
    ? (async () => {
      const tl = performance.now();
      try {
        let run: LinkedInRun, liLive = false;
        if (!body.live && await exists(liFixture(b.id!))) {
          run = JSON.parse(await Deno.readTextFile(liFixture(b.id!))).run;
          liLog("Using saved LinkedIn results; no Bright Data credit used.");
        } else {
          run = await crawlLinkedIn(b, deps(), liLog);
          liLive = true;
          await Deno.mkdir("dev/fixtures", { recursive: true });
          await Deno.writeTextFile(liFixture(b.id!), JSON.stringify({ recorded_at: new Date().toISOString(), run }, null, 1) + "\n");
        }
        const res = linkedInSignals(b, run, new Date());
        for (const c of res.checks) liLog(`D. ${c.exec}: ${c.result} (${c.detail})`);
        return { run, live: liLive, ...res, seconds: secs(tl) };
      } catch (e) {
        liLog(`LinkedIn failed: ${(e as Error).message}`);
        return { error: `LinkedIn: ${(e as Error).message}`, seconds: secs(tl) };
      }
    })()
    : Promise.resolve(null);

  const [n, l] = await Promise.all([news, li]);
  const signals = [...n.signals, ...((l && "signals" in l && l.signals) || [])].sort((a, z) => z.date.localeCompare(a.date));
  emit({ type: "result", borrower: b, live, tagger: "LLM (Gemini locally, Base44 InvokeLLM in the app)", news: n, linkedin: l, signals });
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
