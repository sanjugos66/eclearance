// tests/utils/debugLogger.ts
import fs from 'fs';
import path from 'path';

const sanitize = (s: string) => s.replace(/[^\w.-]+/g, '_');

const ARTIFACTS_BASE =
  process.env.ARTIFACTS_RUN_DIR || path.join(process.cwd(), 'test-artifacts');

/**
 * Creates the run directory inside ARTIFACTS_RUN_DIR (if set by server),
 * otherwise falls back to ./test-artifacts.
 */
export function createRunLog(employeeName: string, subdir = 'offboarding') {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ARTIFACTS_BASE, subdir, `${sanitize(employeeName)}_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const logfile = path.join(dir, 'run.log');
  const relDir = path.relative(process.cwd(), dir); // handy for printing/links

  return { dir, relDir, logfile };
}

/** Append a timestamped line to the run log (and mirror to console). */
export function saveDebugLog(_employeeName: string, logfile: string, line: string) {
  const msg = `[${new Date().toLocaleTimeString()}] ${line}`;
  console.log(msg);
  try {
    fs.appendFileSync(logfile, msg + '\n');
  } catch {
    // ignore transient write errors
  }
}

/** Helper to build a safe artifact path like screenshot/html/json. */
export function artifactPath(dir: string, tag: string, ext: 'png' | 'html' | 'json' = 'png') {
  return path.join(dir, `${sanitize(tag)}.${ext}`);
}