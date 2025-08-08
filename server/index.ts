// server/index.ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';

type TestAction =
  | 'assign_om'
  | 'click_ok_on_error'
  | 'cancel_on_warning'
  | 'confirm_final'
  | 'noop';

type TestCase = {
  id: string;
  name: string;
  employeeName?: string;
  spec: string;
  grep?: string;
  env?: Record<string, string>;
  actions?: TestAction[];
  createdAt: string;
  updatedAt: string;
};

type RunRecord = {
  runId: string;
  testCaseId: string;
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error';
  startedAt?: string;
  finishedAt?: string;
  artifactsDir?: string;
  exitCode?: number | null;
  error?: string;
  logPath?: string;
};

const app = express();
app.use(cors());
app.use(express.json());

/** ===== Paths & simple JSON “DB” ===== */
const ROOT = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT, 'server_data');
const CASES_PATH = path.join(DATA_DIR, 'test_cases.json');
const RUNS_PATH = path.join(DATA_DIR, 'runs.json');
const ARTIFACTS_ROOT = path.join(ROOT, 'artifacts');
const QA_UI_DIR = path.join(ROOT, 'qa-ui');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(ARTIFACTS_ROOT, { recursive: true });

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}
function writeJson<T>(file: string, data: T) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

const getCases = () => readJson<TestCase[]>(CASES_PATH, []);
const saveCases = (cases: TestCase[]) => writeJson(CASES_PATH, cases);
const getRuns = () => readJson<RunRecord[]>(RUNS_PATH, []);
const saveRuns = (runs: RunRecord[]) => writeJson(RUNS_PATH, runs);

/** ===== Static UI & artifacts ===== */
if (fs.existsSync(QA_UI_DIR)) app.use('/qa-ui', express.static(QA_UI_DIR));
app.get('/', (_req, res) => {
  const p = path.join(QA_UI_DIR, 'index.html');
  if (fs.existsSync(p)) return res.sendFile(p);
  res.type('text/plain').send('UI not found. Put an index.html in /qa-ui.');
});
app.use('/artifacts', express.static(ARTIFACTS_ROOT, { fallthrough: true }));

/** ===== Test Cases API ===== */
app.get('/api/cases', (_req, res) => res.json(getCases()));

app.post('/api/cases', (req, res) => {
  const now = new Date().toISOString();
  const tc: TestCase = {
    id: uuid(),
    name: String(req.body?.name ?? 'Untitled Case'),
    employeeName: req.body?.employeeName,
    spec: String(req.body?.spec ?? 'tests/validate-offboarding.spec.ts'),
    grep: req.body?.grep,
    env: req.body?.env ?? {},
    actions: Array.isArray(req.body?.actions) ? req.body.actions : [],
    createdAt: now,
    updatedAt: now,
  };
  const cases = getCases();
  cases.push(tc);
  saveCases(cases);
  res.status(201).json(tc);
});

app.put('/api/cases/:id', (req, res) => {
  const cases = getCases();
  const idx = cases.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const now = new Date().toISOString();
  cases[idx] = { ...cases[idx], ...req.body, id: cases[idx].id, updatedAt: now };
  saveCases(cases);
  res.json(cases[idx]);
});

app.delete('/api/cases/:id', (req, res) => {
  const cases = getCases();
  const next = cases.filter(c => c.id !== req.params.id);
  if (next.length === cases.length) return res.status(404).json({ error: 'Not found' });
  saveCases(next);
  res.json({ ok: true });
});

/** ===== Runs API ===== */
app.get('/api/runs', (_req, res) => res.json(getRuns()));
app.get('/api/runs/:runId', (req, res) => {
  const run = getRuns().find(r => r.runId === req.params.runId);
  if (!run) return res.status(404).json({ error: 'Not found' });
  res.json(run);
});

/** SSE: live log stream for a run */
app.get('/api/runs/:runId/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const run = getRuns().find(r => r.runId === req.params.runId);
  if (!run) {
    res.write(`event: error\ndata: ${JSON.stringify({ error: 'Run not found' })}\n\n`);
    return res.end();
  }

  const logFile = run.logPath && fs.existsSync(run.logPath) ? run.logPath : null;
  let position = 0;

  function sendLine(line: string) {
    res.write(`data: ${JSON.stringify({ line })}\n\n`);
  }

  if (logFile) {
    try {
      const existing = fs.readFileSync(logFile, 'utf8');
      position = Buffer.byteLength(existing);
      existing.split(/\r?\n/).forEach(l => l && sendLine(l));
    } catch {}
  }

  const interval = setInterval(() => {
    const latest = getRuns().find(r => r.runId === req.params.runId);
    if (!latest) return;
    if (logFile && fs.existsSync(logFile)) {
      try {
        const stat = fs.statSync(logFile);
        if (stat.size > position) {
          const buf = fs.readFileSync(logFile);
          const chunk = buf.toString('utf8', position);
          position = stat.size;
          chunk.split(/\r?\n/).forEach(l => l && sendLine(l));
        }
      } catch {}
    }
    res.write(`event: status\ndata: ${JSON.stringify({ status: latest.status, exitCode: latest.exitCode })}\n\n`);
    if (['passed', 'failed', 'error'].includes(latest.status)) {
      clearInterval(interval);
      res.write(`event: done\ndata: ${JSON.stringify(latest)}\n\n`);
      res.end();
    }
  }, 1000);

  req.on('close', () => clearInterval(interval));
});

/** ===== Kick off a run (with watchdog) ===== */
app.post('/api/run', async (req, res) => {
  const { testCaseId, headed = true } = req.body ?? {};
  const tc = getCases().find(c => c.id === testCaseId);
  if (!tc) return res.status(404).json({ error: 'Test case not found' });

  const runId = uuid();
  const runDir = path.join(ARTIFACTS_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const logPath = path.join(runDir, 'run.log');

  const run: RunRecord = {
    runId,
    testCaseId: tc.id,
    status: 'queued',
    artifactsDir: runDir,
    startedAt: new Date().toISOString(),
    logPath,
  };
  saveRuns([...getRuns(), run]);

  res.status(202).json({ runId, artifactsUrl: `/artifacts/${runId}`, stream: `/api/runs/${runId}/stream` });

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (tc.employeeName) childEnv['EMPLOYEE_NAME'] = tc.employeeName;
  if (tc.actions?.length) childEnv['QA_ACTIONS'] = tc.actions.join(',');
  Object.entries(tc.env ?? {}).forEach(([k, v]) => (childEnv[k] = String(v)));
  childEnv['ARTIFACTS_RUN_DIR'] = runDir;

  const args = ['playwright', 'test', tc.spec];
  if (tc.grep) args.push('--grep', tc.grep);
  if (headed) args.push('--headed');

  append(logPath, `Starting run ${runId} for case "${tc.name}"\n> npx ${args.join(' ')}\n`);

  updateRun(runId, { status: 'running' });

  const child = spawn('npx', args, {
    cwd: ROOT,
    env: childEnv,
    shell: process.platform === 'win32',
  });

  child.stdout.on('data', b => append(logPath, b.toString()));
  child.stderr.on('data', b => append(logPath, b.toString()));
  child.on('error', err => {
    append(logPath, `\n[ERROR] ${err?.message}\n`);
    finishRun(runId, 'error', 1, err?.message);
  });

  // #### Watchdog ####
  const MAX_RUN_SECONDS = Number(process.env.MAX_RUN_SECONDS ?? 180); // 3 min default
  const term = setTimeout(() => {
    append(logPath, `\n[WATCHDOG] Exceeded ${MAX_RUN_SECONDS}s. Sending SIGTERM…\n`);
    try { child.kill('SIGTERM'); } catch {}
    const killHard = setTimeout(() => {
      if (!child.killed) {
        append(logPath, `[WATCHDOG] Forcing SIGKILL…\n`);
        try { child.kill('SIGKILL'); } catch {}
      }
    }, 10_000);
    child.once('close', () => clearTimeout(killHard));
  }, MAX_RUN_SECONDS * 1000);

  child.on('close', (code) => {
    clearTimeout(term);
    append(logPath, `\nProcess exited with code ${code}\n`);
    const status = code === 0 ? 'passed' : 'failed';
    finishRun(runId, status, code ?? null, code === null ? 'Killed by watchdog' : undefined);
  });
});

/** ===== Helpers ===== */
function updateRun(runId: string, patch: Partial<RunRecord>) {
  const runs = getRuns();
  const idx = runs.findIndex(r => r.runId === runId);
  if (idx === -1) return;
  runs[idx] = { ...runs[idx], ...patch };
  saveRuns(runs);
}
function finishRun(runId: string, status: RunRecord['status'], exitCode: number | null, error?: string) {
  updateRun(runId, { status, exitCode, error, finishedAt: new Date().toISOString() });
}
function append(file: string, text: string) {
  try { fs.appendFileSync(file, text); } catch (e) { console.error('Log append failed:', e); }
}

/** ===== Start server ===== */
const PORT = Number(process.env.PORT || 5173);
app.listen(PORT, () => {
  console.log(`QA Orchestrator listening on http://localhost:${PORT}`);
  console.log(`Artifacts served from ${ARTIFACTS_ROOT}`);
});