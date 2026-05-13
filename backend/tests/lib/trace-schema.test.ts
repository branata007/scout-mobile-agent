import { describe, it, expect } from 'vitest';
import { traceBundleV1Schema, type TraceBundleV1 } from '../../src/lib/trace-schema.js';

describe('traceBundleV1Schema', () => {
  const valid: TraceBundleV1 = {
    version: 1,
    recorded_at: '2026-05-12T10:00:00.000Z',
    flow_name: 'checkout',
    actions: [
      { type: 'launch', timestamp_ms: 0 },
      { type: 'tap', target: { selector: 'Login' }, timestamp_ms: 1500 },
    ],
    states: [
      {
        after_action_index: 0,
        screenshot_path: 'screens/0.png',
        ui_tree: { type: 'root' },
        timestamp_ms: 100,
      },
    ],
  };

  it('accepts a valid bundle', () => {
    const result = traceBundleV1Schema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('rejects wrong version', () => {
    const r = traceBundleV1Schema.safeParse({ ...valid, version: 2 });
    expect(r.success).toBe(false);
  });

  it('rejects unknown action type', () => {
    const r = traceBundleV1Schema.safeParse({
      ...valid,
      actions: [{ type: 'teleport', timestamp_ms: 0 }],
    });
    expect(r.success).toBe(false);
  });

  it('accepts an optional intent', () => {
    const r = traceBundleV1Schema.safeParse({ ...valid, intent: 'verify happy path' });
    expect(r.success).toBe(true);
  });

  it('rejects negative timestamps', () => {
    const r = traceBundleV1Schema.safeParse({
      ...valid,
      actions: [{ type: 'launch', timestamp_ms: -1 }],
    });
    expect(r.success).toBe(false);
  });
});
