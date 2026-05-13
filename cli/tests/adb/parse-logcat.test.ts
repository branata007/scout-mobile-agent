import { describe, it, expect } from 'vitest';
import { parseLogcat } from '../../src/adb/parse-logcat.js';
import { SAMPLE_LOGCAT_LINES } from '../helpers/fixtures.js';

describe('parseLogcat', () => {
  it('parses 4 lines with right levels', () => {
    const refDate = new Date('2026-05-13T00:00:00.000Z');
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, refDate);
    expect(lines).toHaveLength(4);
    expect(lines[0]?.level).toBe('info');
    expect(lines[1]?.level).toBe('debug');
    expect(lines[2]?.level).toBe('warn');
    expect(lines[3]?.level).toBe('error');
  });

  it('extracts tag and message', () => {
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, new Date('2026-05-13T00:00:00.000Z'));
    expect(lines[0]?.tag).toBe('MyApp');
    expect(lines[0]?.message).toBe('Login button tapped');
  });

  it('produces non-negative timestamp_ms relative to refDate', () => {
    const refDate = new Date('2026-05-13T12:34:56.000Z');
    const lines = parseLogcat(SAMPLE_LOGCAT_LINES, refDate);
    expect(lines[0]?.timestamp_ms).toBeGreaterThanOrEqual(0);
  });

  it('skips empty and unrecognized lines', () => {
    const input = `\n\nsome garbage line\n05-13 10:00:00.000  1  1 V Tag : ok\n`;
    const lines = parseLogcat(input, new Date('2026-05-13T00:00:00.000Z'));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('verbose');
  });
});
