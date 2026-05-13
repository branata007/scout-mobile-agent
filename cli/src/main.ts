#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';
import { runInit } from './commands/init.js';
import { runRecord } from './commands/record.js';
import { runDone } from './commands/done.js';
import { runUpload } from './commands/upload.js';
import { runStatus } from './commands/status.js';

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

  program
    .command('done')
    .description('Report the status of the most recent recording (recovery helper).')
    .option('--flow <name>', 'Specific flow name (default: most recent)')
    .action(async (opts: { flow?: string }) => {
      const r = await runDone({ cwd: process.cwd(), flowName: opts.flow });
      if (r.finalized) {
        console.log(`scout: bundle at ${r.bundleDir} is finalized.`);
      } else {
        console.log(`scout: bundle at ${r.bundleDir} is INCOMPLETE (no trace.json). Re-record the flow.`);
      }
    });

  program
    .command('upload')
    .description('Upload the most recent recording to the backend.')
    .option('--flow <name>', 'Specific flow name (default: most recent)')
    .option('--personas <list>', 'Comma-separated persona names', 'happy-rusher,low-vision,first-timer')
    .option('--intent <text>', 'Optional intent annotation')
    .action(async (opts: { flow?: string; personas: string; intent?: string }) => {
      const personas = opts.personas.split(',').map((s) => s.trim()).filter(Boolean);
      const r = await runUpload({
        cwd: process.cwd(),
        env: process.env,
        flowName: opts.flow,
        personas,
        intent: opts.intent,
      });
      console.log(`scout: uploaded ${r.bundleDir}`);
      console.log(`scout: run id ${r.runId}`);
    });

  program
    .command('status')
    .description('Show current project + last recording + last upload.')
    .action(async () => {
      const s = await runStatus({ cwd: process.cwd(), env: process.env });
      console.log(`project:   ${s.project.name} (${s.project.id})`);
      console.log(`package:   ${s.project.appPackage}`);
      console.log(`backend:   ${s.backendUrl}`);
      console.log(`last bundle: ${s.lastBundleDir ?? '(none)'}`);
      console.log(`last run:    ${s.lastRunId ?? '(not uploaded)'}`);
    });

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
