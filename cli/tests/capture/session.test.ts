import { describe, it, expect } from 'vitest';
import { CaptureSession } from '../../src/capture/session.js';

describe('CaptureSession', () => {
  it('records a launch action and initial state', () => {
    const s = new CaptureSession({ flowName: 'checkout', startedAtMs: 1000 });
    s.recordAction({ type: 'launch', tsMs: 1000 });
    s.recordState({ uiTree: { type: 'root' }, screenshot: Buffer.from('p0'), tsMs: 1100 });
    const b = s.toBundle();
    expect(b.flow_name).toBe('checkout');
    expect(b.actions).toHaveLength(1);
    expect(b.actions[0]?.timestamp_ms).toBe(0);
    expect(b.states).toHaveLength(1);
    expect(b.states[0]?.after_action_index).toBe(0);
    expect(b.states[0]?.screenshot_path).toBe('screens/0.png');
  });

  it('records multiple actions with relative timestamps', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 1000 });
    s.recordAction({ type: 'tap', tsMs: 1500 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('s0'), tsMs: 1600 });
    s.recordAction({ type: 'input', tsMs: 2000, value: 'hello' });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('s1'), tsMs: 2100 });
    const b = s.toBundle();
    expect(b.actions).toHaveLength(2);
    expect(b.actions[0]?.timestamp_ms).toBe(500);
    expect(b.actions[1]?.timestamp_ms).toBe(1000);
    expect(b.actions[1]?.value).toBe('hello');
    expect(b.states[1]?.screenshot_path).toBe('screens/1.png');
  });

  it('attaches intent and logs', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 1000, intent: 'verify the flow' });
    s.recordAction({ type: 'launch', tsMs: 1000 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('p'), tsMs: 1050 });
    s.appendLogs([{ level: 'info', tag: 'X', message: 'm', timestamp_ms: 10 }]);
    const b = s.toBundle();
    expect(b.intent).toBe('verify the flow');
    expect(b.logs).toHaveLength(1);
  });

  it('exposes screenshots in order', () => {
    const s = new CaptureSession({ flowName: 'f', startedAtMs: 0 });
    s.recordAction({ type: 'launch', tsMs: 0 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('a'), tsMs: 1 });
    s.recordAction({ type: 'tap', tsMs: 2 });
    s.recordState({ uiTree: {}, screenshot: Buffer.from('b'), tsMs: 3 });
    expect(s.screenshots.map((b) => b.toString())).toEqual(['a', 'b']);
  });
});
