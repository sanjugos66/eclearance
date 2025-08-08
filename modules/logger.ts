import fs from 'fs';
import path from 'path';

export function logToFile(content: string) {
  const logPath = path.join(__dirname, '../logs/offboarding.log');
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${content}\n`;
  fs.appendFileSync(logPath, entry);
}