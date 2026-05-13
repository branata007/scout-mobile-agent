import type { LogLineV1, LogLevel } from '../lib/trace-types.js';

const LINE_RE = /^(\d{2})-(\d{2})\s(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+\d+\s+\d+\s+([VDIWEF])\s+([^:]+?)\s*:\s*(.*)$/;

const LEVEL_MAP: Record<string, LogLevel> = {
  V: 'verbose',
  D: 'debug',
  I: 'info',
  W: 'warn',
  E: 'error',
  F: 'fatal',
};

export function parseLogcat(raw: string, refDate: Date): LogLineV1[] {
  const refYear = refDate.getUTCFullYear();
  const out: LogLineV1[] = [];
  for (const line of raw.split('\n')) {
    const m = LINE_RE.exec(line);
    if (!m) continue;
    const [, MM, DD, hh, mm, ss, ms, lvl, tag, message] = m;
    const date = new Date(Date.UTC(
      refYear,
      parseInt(MM!, 10) - 1,
      parseInt(DD!, 10),
      parseInt(hh!, 10),
      parseInt(mm!, 10),
      parseInt(ss!, 10),
      parseInt(ms!, 10),
    ));
    const ts = Math.max(0, date.getTime() - refDate.getTime());
    out.push({
      level: LEVEL_MAP[lvl!]!,
      tag: tag!.trim(),
      message: message!,
      timestamp_ms: ts,
    });
  }
  return out;
}
