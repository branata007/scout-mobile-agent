import { describe, it, expect } from 'vitest';
import { Recorder, type RecorderEvent, type RecorderEventSource } from '../../src/capture/recorder.js';
import { FakeAdbClient } from '../helpers/fake-adb.js';

class ScriptedEvents implements RecorderEventSource {
  private idx = 0;
  constructor(private readonly events: RecorderEvent[]) {}
  async next(): Promise<RecorderEvent> {
    if (this.idx >= this.events.length) return { type: 'quit' };
    return this.events[this.idx++]!;
  }
}

describe('Recorder', () => {
  it('records launch + 2 captures + quit', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([
      { type: 'capture', actionType: 'tap' },
      { type: 'capture', actionType: 'input', value: 'hello@example.com' },
      { type: 'quit' },
    ]);
    const r = new Recorder({
      adb,
      serial: 'emulator-5554',
      packageName: 'com.example.app',
      flowName: 'login',
      events,
      now: () => 1000,
    });
    const session = await r.run();
    expect(session.actionCount).toBe(3);
    expect(session.screenshots.length).toBe(3);
    expect(session.flowName).toBe('login');

    const launches = adb.calls.filter((c) => c.method === 'launchApp');
    expect(launches).toHaveLength(1);
    expect(launches[0]?.args).toEqual(['emulator-5554', 'com.example.app']);
  });

  it('quit-immediately produces just launch action+state', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([{ type: 'quit' }]);
    const r = new Recorder({
      adb,
      serial: 'emulator-5554',
      packageName: 'com.example.app',
      flowName: 'empty',
      events,
      now: () => 0,
    });
    const session = await r.run();
    expect(session.actionCount).toBe(1);
    expect(session.screenshots.length).toBe(1);
  });

  it('input action carries value', async () => {
    const adb = new FakeAdbClient();
    const events = new ScriptedEvents([
      { type: 'capture', actionType: 'input', value: 'test@x.com' },
      { type: 'quit' },
    ]);
    const r = new Recorder({
      adb,
      serial: 'e',
      packageName: 'p',
      flowName: 'i',
      events,
      now: () => 0,
    });
    const session = await r.run();
    const bundle = session.toBundle();
    expect(bundle.actions[1]?.type).toBe('input');
    expect(bundle.actions[1]?.value).toBe('test@x.com');
  });
});
