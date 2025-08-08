import fs from 'fs';
import path from 'path';

export function createRunLog(employeeName: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join('test-artifacts', `${employeeName.replace(/\s+/g, '_')}_${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const logfile = path.join(dir, 'run.log');
  return { dir, logfile };
}

export function saveDebugLog(_employeeName: string, logfile: string, line: string) {
  const msg = `[${new Date().toLocaleTimeString()}] ${line}`;
  // stdout for CI visibility
  console.log(msg);
  try { fs.appendFileSync(logfile, msg + '\n'); } catch {}
}