// Daytona "document sandbox" for analyzeCashflow. Pure: no npm: imports, no Deno globals.
//
// PDF and Excel statements are parsed inside a throwaway Daytona sandbox by a fixed
// Python script (sandboxParser.py.ts) using real parsers (pdfplumber, openpyxl, xlrd),
// so every transaction is a real statement line and untrusted applicant files are
// never opened on our backend. The sandbox is always deleted, even on failure or
// timeout. Only rows come back; everything after that is the existing pipeline.
//
// REST API (confirmed against https://www.daytona.io/docs/openapi.json and
// toolbox-openapi.json, and a live run):
//   POST   {api}/sandbox                         create; returns { id, state, toolboxProxyUrl }
//   GET    {api}/sandbox/{id}                    poll state until 'started'
//   POST   {proxy}/{id}/files/upload-v2?path=…   raw body upload
//   POST   {proxy}/{id}/process/execute          { command, timeout } -> { exitCode, result }
//   DELETE {api}/sandbox/{id}
// Auth: Authorization: Bearer <DAYTONA_API_KEY>.

import { normaliseRows } from './parse.ts';
import type { Row } from './parse.ts';
import { SANDBOX_PARSER_PY } from './sandboxParser.py.ts';

export const ROWS_MARKER = 'EW_ROWS_JSON:';
/** Total time allowed for the sandbox path (download + create + parse + delete) before falling back. */
export const SANDBOX_BUDGET_MS = 60_000;
export const MAX_SANDBOX_FILE_BYTES = 5_000_000;
export const DAYTONA_API_URL = 'https://app.daytona.io/api';

const WORK_DIR = '/tmp/ew';
const SCRIPT_PATH = `${WORK_DIR}/parse_statement.py`;
const EXEC_TIMEOUT_S = 45;
const DELETE_TIMEOUT_MS = 10_000;

export type SandboxFileKind = 'pdf' | 'xlsx' | 'xls';

export interface ExecResult {
  exitCode: number;
  result: string;
}

export interface DaytonaClient {
  /** Create a sandbox and resolve once it is started. */
  create(): Promise<{ id: string }>;
  upload(id: string, path: string, bytes: Uint8Array): Promise<void>;
  exec(id: string, command: string, timeoutSec: number): Promise<ExecResult>;
  remove(id: string): Promise<void>;
}

export interface SandboxTimings {
  create_ms: number;
  upload_ms: number;
  exec_ms: number;
  total_ms: number;
}

export interface SandboxRun {
  rows: Row[];
  timings: SandboxTimings;
}

/** Python packages each file kind needs (installed only if missing). */
const PACKAGES: Record<SandboxFileKind, { module: string; pip: string }> = {
  pdf: { module: 'pdfplumber', pip: 'pdfplumber' },
  xlsx: { module: 'openpyxl', pip: 'openpyxl' },
  xls: { module: 'xlrd', pip: 'xlrd' },
};

export function sandboxFileKind(url: string): SandboxFileKind | null {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return null;
  }
  if (path.endsWith('.pdf')) return 'pdf';
  if (path.endsWith('.xlsx')) return 'xlsx';
  if (path.endsWith('.xls')) return 'xls';
  return null;
}

/** Read the parser's marker line from sandbox stdout. Never throws. */
export function parseSandboxOutput(stdout: string): { rows: Row[]; error: string | null } {
  if (typeof stdout !== 'string') return { rows: [], error: 'No parser output' };
  const line = stdout
    .split('\n')
    .filter((l) => l.startsWith(ROWS_MARKER))
    .pop();
  if (!line) return { rows: [], error: 'No parser output' };
  let data: unknown;
  try {
    data = JSON.parse(line.slice(ROWS_MARKER.length));
  } catch {
    return { rows: [], error: 'Parser output is not valid JSON' };
  }
  const record = (typeof data === 'object' && data !== null ? data : {}) as { rows?: unknown; error?: unknown };
  if (typeof record.error === 'string' && record.error) return { rows: [], error: record.error };
  if (!Array.isArray(record.rows)) return { rows: [], error: 'Parser output has no rows' };
  return { rows: normaliseRows(record.rows), error: null };
}

function parseCommand(kind: SandboxFileKind, filePath: string): string {
  const pkg = PACKAGES[kind];
  const install = `python3 -c "import ${pkg.module}" 2>/dev/null || pip install -q --disable-pip-version-check ${pkg.pip} >/dev/null 2>&1`;
  return `sh -c '${install}; python3 ${SCRIPT_PATH} ${kind} ${filePath}'`;
}

export interface SandboxInput {
  client: DaytonaClient;
  bytes: Uint8Array;
  kind: SandboxFileKind;
  budgetMs?: number;
  now?: () => number;
}

/**
 * Parse one statement file in a fresh sandbox. Throws on failure or when the budget runs
 * out; the sandbox is deleted in every case (a sandbox that finishes creating after the
 * deadline is deleted as soon as it arrives).
 */
export async function extractRowsInSandbox(input: SandboxInput): Promise<SandboxRun> {
  const { client, bytes, kind } = input;
  if (bytes.byteLength > MAX_SANDBOX_FILE_BYTES) throw new Error('File is too large for the sandbox');
  const now = input.now ?? (() => Date.now());
  const budgetMs = input.budgetMs ?? SANDBOX_BUDGET_MS;
  const started = now();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sandbox timed out after ${Math.round(budgetMs / 1000)} s`)), Math.max(0, budgetMs));
  });
  const race = <T>(p: Promise<T>): Promise<T> => Promise.race([p, deadline]);

  const creating = client.create();
  let sandboxId: string | null = null;
  try {
    const sandbox = await race(creating);
    sandboxId = sandbox.id;
    const createdAt = now();
    const filePath = `${WORK_DIR}/statement.${kind}`;
    await race(client.upload(sandbox.id, SCRIPT_PATH, new TextEncoder().encode(SANDBOX_PARSER_PY)));
    await race(client.upload(sandbox.id, filePath, bytes));
    const uploadedAt = now();
    const run = await race(client.exec(sandbox.id, parseCommand(kind, filePath), EXEC_TIMEOUT_S));
    const ranAt = now();
    if (run.exitCode !== 0) throw new Error(`Parser exit code ${run.exitCode}: ${String(run.result ?? '').slice(0, 200)}`);
    const parsed = parseSandboxOutput(run.result);
    if (parsed.error) throw new Error(`Parser error: ${parsed.error}`);
    return {
      rows: parsed.rows,
      timings: {
        create_ms: createdAt - started,
        upload_ms: uploadedAt - createdAt,
        exec_ms: ranAt - uploadedAt,
        total_ms: ranAt - started,
      },
    };
  } finally {
    clearTimeout(timer);
    if (sandboxId) {
      await removeQuietly(client, sandboxId);
    } else {
      // create() lost the race or failed: delete it if it still turns up.
      creating.then((sb) => removeQuietly(client, sb.id)).catch(() => {});
    }
  }
}

async function removeQuietly(client: DaytonaClient, id: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      client.remove(id),
      new Promise((resolve) => {
        timer = setTimeout(resolve, DELETE_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Auto-stop + auto-delete on the sandbox are the backstop.
  } finally {
    clearTimeout(timer);
  }
}

// ---------- REST client ----------

export interface RestClientOptions {
  apiKey: string;
  apiUrl?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  /** Minutes of inactivity before Daytona stops the sandbox; it is deleted when stopped. */
  autoStopMinutes?: number;
}

interface SandboxDto {
  id?: string;
  state?: string;
  errorReason?: string;
  toolboxProxyUrl?: string;
}

const FAILED_STATES = new Set(['error', 'build_failed', 'destroyed', 'destroying']);

export function createDaytonaRestClient(options: RestClientOptions): DaytonaClient {
  const apiUrl = (options.apiUrl ?? DAYTONA_API_URL).replace(/\/+$/, '');
  const doFetch = options.fetchImpl ?? fetch;
  const pollMs = options.pollMs ?? 400;
  const auth = { Authorization: `Bearer ${options.apiKey}` };
  const proxies = new Map<string, string>();

  async function call(url: string, init: RequestInit = {}): Promise<unknown> {
    const res = await doFetch(url, { ...init, headers: { ...auth, ...(init.headers ?? {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Daytona ${init.method ?? 'GET'} ${new URL(url).pathname} failed (HTTP ${res.status}): ${text.slice(0, 160)}`);
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  function toolbox(id: string): string {
    const proxy = proxies.get(id);
    if (!proxy) throw new Error('Sandbox has no toolbox URL');
    return `${proxy.replace(/\/+$/, '')}/${id}`;
  }

  return {
    async create() {
      let dto = (await call(`${apiUrl}/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autoStopInterval: options.autoStopMinutes ?? 2,
          autoDeleteInterval: 0,
          labels: { app: 'early-warning', purpose: 'statement-parse' },
        }),
      })) as SandboxDto;
      if (!dto.id) throw new Error('Daytona create returned no sandbox id');
      const id = dto.id;
      while (dto.state !== 'started') {
        if (dto.state && FAILED_STATES.has(dto.state)) {
          // Clean up a sandbox that failed to start; the caller never learns its id.
          await call(`${apiUrl}/sandbox/${id}`, { method: 'DELETE' }).catch(() => {});
          throw new Error(`Sandbox ${dto.state}: ${dto.errorReason ?? 'unknown reason'}`);
        }
        await new Promise((r) => setTimeout(r, pollMs));
        dto = (await call(`${apiUrl}/sandbox/${id}`)) as SandboxDto;
      }
      if (dto.toolboxProxyUrl) proxies.set(id, dto.toolboxProxyUrl);
      return { id };
    },
    async upload(id, path, bytes) {
      await call(`${toolbox(id)}/files/upload-v2?path=${encodeURIComponent(path)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: bytes as unknown as BodyInit,
      });
    },
    async exec(id, command, timeoutSec) {
      const data = (await call(`${toolbox(id)}/process/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, timeout: timeoutSec }),
      })) as { exitCode?: unknown; result?: unknown };
      return {
        exitCode: typeof data.exitCode === 'number' ? data.exitCode : -1,
        result: typeof data.result === 'string' ? data.result : '',
      };
    },
    async remove(id) {
      proxies.delete(id);
      await call(`${apiUrl}/sandbox/${id}`, { method: 'DELETE' });
    },
  };
}
