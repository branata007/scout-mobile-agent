#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';
import { runInit } from './commands/init.js';
import { runRecord } from './commands/record.js';

async function main(): Promise<void> {
  const program = buildProgram();

  program
    .command('init')
    .description('Initialize a Scout project in the current directory.')
    .requiredOption('--name <name>', 'Project display name')
    .requiredOption('--app-package <pkg>', 'Android package id of the app under test (e.g. com.example.app)')
    .option('--backend-url <url>', 'Backend URL', 'http://localhost:3000')
    .action(async (opts: { name: string; appPackage: string; backendUrl: string }) => {
      await runInit({
        cwd: process.cwd(),
        env: process.env,
        projectName: opts.name,
        appPackage: opts.appPackage,
        backendUrl: opts.backendUrl,
      });
      console.log(`scout: initialized project "${opts.name}" — wrote scout.toml`);
    });

  program
    .command('record <flow>')
    .description('Record a happy-path flow against a connected emulator.')
    .option('--intent <text>', 'Optional intent annotation')
    .option('--serial <serial>', 'Specific emulator serial (default: first connected)')
    .action(async (flow: string, opts: { intent?: string; serial?: string }) => {
      await runRecord({
        cwd: process.cwd(),
        env: process.env,
        flowName: flow,
        intent: opts.intent,
        serial: opts.serial,
      });
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
