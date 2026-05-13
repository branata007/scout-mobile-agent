import { Command } from 'commander';
import kleur from 'kleur';
import { CliError } from './lib/errors.js';

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('scout')
    .description('Scout CLI — record happy-path flows on Android emulators and upload to the Scout backend.')
    .version('0.1.0');
  return program;
}

export function reportError(err: unknown): number {
  if (err instanceof CliError) {
    console.error(kleur.red(`scout: ${err.code}: ${err.message}`));
    return err.exitCode;
  }
  console.error(kleur.red(`scout: unexpected error: ${(err as Error).message}`));
  return 1;
}
