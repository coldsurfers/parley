import { Command } from 'commander';
import pc from 'picocolors';

import { runDiff } from './commands/diff.ts';
import { runDoctor } from './commands/doctor.ts';
import { runGet } from './commands/get.ts';
import { runInit } from './commands/init.ts';
import { runList } from './commands/list.ts';
import { runPull } from './commands/pull.ts';
import { runPush } from './commands/push.ts';
import { runRun } from './commands/run.ts';
import { runSet } from './commands/set.ts';
import { runSync, type SyncDirection } from './commands/sync.ts';
import { runUnset } from './commands/unset.ts';
import { type ParleyConfig, resolveAppProfile } from './core/config.ts';
import { ParleyError } from './core/errors.ts';
import { type LoadedConfig, loadConfig } from './core/loader.ts';
import { createSsmStore, type SsmStore } from './core/ssm.ts';
import { createSsmClient } from './lib/aws.ts';

type CommonContext = LoadedConfig & { store: SsmStore };

async function loadContext(): Promise<CommonContext> {
  const loaded = await loadConfig();
  const client = createSsmClient({ region: loaded.config.region });
  return { ...loaded, store: createSsmStore(client) };
}

function withErrorHandling<TArgs extends unknown[]>(
  fn: (...args: TArgs) => Promise<void>,
): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof ParleyError) {
        console.error(pc.red(`✗ ${err.message}`));
      } else {
        console.error(pc.red(`✗ ${(err as Error).message ?? err}`));
      }
      process.exitCode = 1;
    }
  };
}

async function resolveAppArg(config: ParleyConfig, app: string | undefined): Promise<string> {
  if (app) return app;
  throw new Error(`app argument is required. Available apps: ${Object.keys(config.apps).join(', ')}`);
}

async function resolveProfileArg(config: ParleyConfig, app: string, profile: string | undefined): Promise<string> {
  if (profile) {
    resolveAppProfile(config, app, profile);
    return profile;
  }
  throw new Error(
    `profile argument is required. Candidates for '${app}': ${(config.apps[app]?.profiles ?? []).join(', ')}`,
  );
}

const program = new Command();

program
  .name('parley')
  .description('Git-style .env sync between your machine and AWS Parameter Store')
  .version('0.0.0', '-v, --version', 'output version')
  .helpOption('-h, --help', 'output help')
  .showHelpAfterError();

program
  .command('init')
  .description('create parley.config.ts + STS credential sanity check (run doctor for full KMS/IAM validation)')
  .option('-f, --force', 'overwrite existing file without prompt')
  .option('--skip-validation', 'skip AWS credential validation')
  .action(
    withErrorHandling(async (options: { force?: boolean; skipValidation?: boolean }) => {
      await runInit({ force: options.force, skipValidation: options.skipValidation }, {});
    }),
  );

program
  .command('push')
  .description('local .env.<profile> -> SSM (changes only)')
  .argument('[app]', 'app identifier (e.g., api, web)')
  .argument('[profile]', 'profile (e.g., development)')
  .option('--dry-run', 'print pending changes without making any calls')
  .option('-y, --yes', 'skip confirmation prompt')
  .action(
    withErrorHandling(
      async (
        appArg: string | undefined,
        profileArg: string | undefined,
        options: { dryRun?: boolean; yes?: boolean },
      ) => {
        const ctx = await loadContext();
        const app = await resolveAppArg(ctx.config, appArg);
        const profile = await resolveProfileArg(ctx.config, app, profileArg);
        await runPush({ app, profile, dryRun: options.dryRun, yes: options.yes }, ctx);
      },
    ),
  );

program
  .command('pull')
  .description('SSM -> local .env.<profile>')
  .argument('[app]', 'app identifier')
  .argument('[profile]', 'profile')
  .option('-f, --force', 'overwrite existing file without prompt')
  .action(
    withErrorHandling(
      async (appArg: string | undefined, profileArg: string | undefined, options: { force?: boolean }) => {
        const ctx = await loadContext();
        const app = await resolveAppArg(ctx.config, appArg);
        const profile = await resolveProfileArg(ctx.config, app, profileArg);
        await runPull({ app, profile, force: options.force }, ctx);
      },
    ),
  );

program
  .command('diff')
  .description('local vs remote key diff (values compared by hash)')
  .argument('[app]', 'app identifier')
  .argument('[profile]', 'profile')
  .option('--exit-code', 'exit 1 if there are differences (for CI)')
  .action(
    withErrorHandling(
      async (appArg: string | undefined, profileArg: string | undefined, options: { exitCode?: boolean }) => {
        const ctx = await loadContext();
        const app = await resolveAppArg(ctx.config, appArg);
        const profile = await resolveProfileArg(ctx.config, app, profileArg);
        const outcome = await runDiff({ app, profile }, ctx);
        if (options.exitCode && outcome.hasChanges) process.exitCode = 1;
      },
    ),
  );

program
  .command('list')
  .description('list SSM keys')
  .argument('<app>', 'app identifier')
  .argument('[profile]', 'profile (all profiles when omitted)')
  .action(
    withErrorHandling(async (appArg: string, profileArg: string | undefined) => {
      const ctx = await loadContext();
      const app = await resolveAppArg(ctx.config, appArg);
      let profile: string | undefined;
      if (profileArg) profile = await resolveProfileArg(ctx.config, app, profileArg);
      await runList({ app, profile }, ctx);
    }),
  );

program
  .command('get')
  .description('get a single value (masked by default)')
  .argument('<app>', 'app identifier')
  .argument('<profile>', 'profile')
  .argument('<key>', 'env var key')
  .option('--reveal', 'print the value in plaintext')
  .action(
    withErrorHandling(async (appArg: string, profileArg: string, key: string, options: { reveal?: boolean }) => {
      const ctx = await loadContext();
      const app = await resolveAppArg(ctx.config, appArg);
      const profile = await resolveProfileArg(ctx.config, app, profileArg);
      await runGet({ app, profile, key, reveal: options.reveal }, ctx);
    }),
  );

program
  .command('set')
  .description('add or update a single value')
  .argument('<app>', 'app identifier')
  .argument('<profile>', 'profile')
  .argument('<key>', 'env var key')
  .argument('[value]', 'value (prompted on stdin when omitted)')
  .action(
    withErrorHandling(async (appArg: string, profileArg: string, key: string, value: string | undefined) => {
      const ctx = await loadContext();
      const app = await resolveAppArg(ctx.config, appArg);
      const profile = await resolveProfileArg(ctx.config, app, profileArg);
      await runSet({ app, profile, key, value }, ctx);
    }),
  );

program
  .command('unset')
  .description('delete a single value')
  .argument('<app>', 'app identifier')
  .argument('<profile>', 'profile')
  .argument('<key>', 'env var key')
  .option('-y, --yes', 'skip confirmation prompt')
  .action(
    withErrorHandling(async (appArg: string, profileArg: string, key: string, options: { yes?: boolean }) => {
      const ctx = await loadContext();
      const app = await resolveAppArg(ctx.config, appArg);
      const profile = await resolveProfileArg(ctx.config, app, profileArg);
      await runUnset({ app, profile, key, yes: options.yes }, ctx);
    }),
  );

program
  .command('run')
  .description('run a command with SSM values injected as env (no disk writes). Usage: -- <cmd> [args...]')
  .requiredOption('--app <app>', 'app identifier', collect, [] as string[])
  .requiredOption('--profile <profile>', 'profile', collect, [] as string[])
  .argument('<command>', 'command to run')
  .argument('[args...]', 'command arguments')
  .action(
    withErrorHandling(async (command: string, args: string[], options: { app: string[]; profile: string[] }) => {
      const ctx = await loadContext();
      const result = await runRun({ apps: options.app, profiles: options.profile, command, args }, ctx);
      process.exitCode = result.exitCode;
    }),
  );

program
  .command('sync')
  .description('bulk push or pull across multiple apps and profiles')
  .argument('<direction>', 'push | pull')
  .option('--app <app...>', 'target app (repeatable, all apps when unspecified)')
  .action(
    withErrorHandling(async (direction: string, options: { app?: string[] }) => {
      if (direction !== 'push' && direction !== 'pull') {
        throw new Error("direction must be 'push' or 'pull'.");
      }
      const ctx = await loadContext();
      await runSync({ direction: direction as SyncDirection, apps: options.app }, ctx);
    }),
  );

program
  .command('doctor')
  .description('comprehensive diagnostics for credentials/SSM/KMS/mapping')
  .action(
    withErrorHandling(async () => {
      const ctx = await loadContext();
      const report = await runDoctor(ctx);
      if (!report.ok) process.exitCode = 1;
    }),
  );

await program.parseAsync(process.argv);

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
