import * as readline from 'node:readline';
import type { RecorderEvent, RecorderEventSource } from './recorder.js';
import type { ActionType } from '../lib/trace-types.js';

const KEY_TO_ACTION: Record<string, ActionType> = {
  t: 'tap',
  s: 'swipe',
  w: 'wait',
  b: 'back',
  h: 'home',
};

export interface StdinEventSourceOpts {
  log: (msg: string) => void;
  input?: NodeJS.ReadStream;
  promptForInput: (question: string) => Promise<string>;
}

export class StdinEventSource implements RecorderEventSource {
  private readonly input: NodeJS.ReadStream;
  private resolver: ((ev: RecorderEvent) => void) | null = null;
  private readonly buffer: RecorderEvent[] = [];
  private pendingActionType: ActionType | null = null;
  private rl: readline.Interface | null = null;
  private setup = false;

  constructor(private readonly opts: StdinEventSourceOpts) {
    this.input = opts.input ?? process.stdin;
  }

  private ensureSetup(): void {
    if (this.setup) return;
    this.setup = true;
    readline.emitKeypressEvents(this.input);
    if (this.input.isTTY) this.input.setRawMode(true);

    this.input.on('keypress', async (_str: string, key: { name?: string; ctrl?: boolean; sequence?: string }) => {
      if (!key) return;
      if (key.ctrl && key.name === 'c') {
        this.emit({ type: 'quit' });
        return;
      }
      if (key.name === 'q') {
        this.emit({ type: 'quit' });
        return;
      }
      if (key.name === 'space') {
        const actionType = this.pendingActionType ?? 'tap';
        this.pendingActionType = null;
        if (actionType === 'input') {
          if (this.input.isTTY) this.input.setRawMode(false);
          const value = await this.opts.promptForInput('value> ');
          if (this.input.isTTY) this.input.setRawMode(true);
          this.emit({ type: 'capture', actionType, value });
        } else {
          this.emit({ type: 'capture', actionType });
        }
        return;
      }
      const k = key.name ?? '';
      if (k === 'i') {
        this.pendingActionType = 'input';
        this.opts.log('  (next SPACE = input)');
        return;
      }
      const mapped = KEY_TO_ACTION[k];
      if (mapped) {
        this.pendingActionType = mapped;
        this.opts.log(`  (next SPACE = ${mapped})`);
      }
    });
  }

  private emit(ev: RecorderEvent): void {
    if (this.resolver) {
      const r = this.resolver;
      this.resolver = null;
      r(ev);
    } else {
      this.buffer.push(ev);
    }
  }

  async next(): Promise<RecorderEvent> {
    this.ensureSetup();
    if (this.buffer.length > 0) return this.buffer.shift()!;
    return await new Promise<RecorderEvent>((resolve) => {
      this.resolver = resolve;
    });
  }

  cleanup(): void {
    if (this.input.isTTY) this.input.setRawMode(false);
    this.rl?.close();
  }
}
