import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import * as readline from 'node:readline/promises';
import kleur from 'kleur';
import { loadConfig } from '../config/load.js';
import { AdbClientImpl } from '../adb/exec.js';
import { Recorder } from '../capture/recorder.js';
import { StdinEventSource } from '../capture/stdin-events.js';
import { finalizeBundle } from '../capture/bundle.js';
import { CliError } from '../lib/errors.js';

export interface RecordInput {
  cwd: string;
  env: Record<string, string | undefined>;
  flowName: string;
  intent?: string;
  serial?: string;
}

export async function runRecord(input: RecordInput): Promise<string> {
  const config = await loadConfig({ cwd: input.cwd, env: input.env });
  if (!config.project.id) {
    throw new CliError(1, 'project_not_initialized', 'scout.toml is missing project.id — run "scout init" first.');
  }
  const adb = new AdbClientImpl();
  const devices = await adb.devices();
  const ready = devices.filter((d) => d.state === 'device');
  if (ready.length === 0) {
    throw new CliError(1, 'no_emulator', 'No connected Android emulator/device. Start an emulator first.');
  }
  const serial = input.serial ?? ready[0]!.serial;

  console.log(kleur.cyan(`scout: using device ${serial}`));
  console.log(kleur.cyan(`scout: pulling APK for ${config.project.appPackage}...`));
  const apkPath = resolve(input.cwd, '.scout', 'tmp', `${serial}.apk`);
  await adb.pullApk(serial, config.project.appPackage, apkPath);

  const apkBuffer = await readFile(apkPath);

  const startedAt = new Date();
  const bundleDir = resolve(
    input.cwd,
    '.scout', 'recordings', input.flowName, startedAt.toISOString().replace(/[:.]/g, '-'),
  );

  console.log();
  console.log(kleur.bold('Recording flow: ') + kleur.yellow(input.flowName));
  console.log('Tap on the emulator, then press SPACE to capture state.');
  console.log('Press a letter before SPACE for action type: t=tap (default), i=input, b=back, h=home, s=swipe, w=wait.');
  console.log('Press q (or Ctrl-C) when done.');
  console.log();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const eventSource = new StdinEventSource({
    log: (msg) => console.log(kleur.dim(msg)),
    promptForInput: async (q) => {
      rl.pause();
      const v = await rl.question(q);
      rl.resume();
      return v;
    },
  });

  const recorder = new Recorder({
    adb,
    serial,
    packageName: config.project.appPackage,
    flowName: input.flowName,
    events: eventSource,
    intent: input.intent,
  });

  let session;
  try {
    session = await recorder.run();
  } finally {
    eventSource.cleanup();
    rl.close();
  }

  console.log();
  console.log(kleur.cyan(`scout: writing bundle to ${bundleDir}`));
  await finalizeBundle({ session, destDir: bundleDir, apk: apkBuffer });
  console.log(kleur.green(`scout: recorded ${session.actionCount} actions. Run "scout upload" to ship it.`));
  return bundleDir;
}
