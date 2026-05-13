#!/usr/bin/env node
import { buildProgram, reportError } from './program.js';

async function main(): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    process.exit(reportError(err));
  }
}

await main();
