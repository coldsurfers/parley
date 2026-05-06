import { spawn } from 'node:child_process';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type RunOptions = {
  /** --app/--profile pairs (matched by index). Must have the same length. Later pairs take precedence on merge. */
  apps: string[];
  profiles: string[];
  command: string;
  args: string[];
};

export type RunDeps = {
  config: ParleyConfig;
  store: SsmStore;
  logger?: Logger;
  /** Injectable child process spawn. Defaults to Node child_process.spawn. For tests. */
  spawnImpl?: (cmd: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
};

export async function runRun(opts: RunOptions, deps: RunDeps): Promise<{ exitCode: number; injectedKeys: string[] }> {
  const log = deps.logger ?? consoleLogger;
  if (opts.apps.length === 0 || opts.apps.length !== opts.profiles.length) {
    throw new Error('--app and --profile must be specified the same number of times.');
  }
  if (!opts.command) throw new Error('a command to run is required (e.g., -- node index.js).');

  const merged = new Map<string, string>();
  for (let i = 0; i < opts.apps.length; i++) {
    const appArg = opts.apps[i] as string;
    const profileArg = opts.profiles[i] as string;
    const { app, profile } = resolveAppProfile(deps.config, appArg, profileArg);
    const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
    log.info(`fetch ${app.name}/${profile}`);
    const map = await deps.store.fetchAll(scope);
    for (const [k, v] of map) merged.set(k, v);
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of merged) childEnv[k] = v;

  log.info(`exec: ${opts.command} ${opts.args.join(' ')}  (injected ${merged.size} keys)`);
  const spawnFn = deps.spawnImpl ?? defaultSpawn;
  const exitCode = await spawnFn(opts.command, opts.args, childEnv);
  return { exitCode, injectedKeys: [...merged.keys()] };
}

function defaultSpawn(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', reject);
  });
}
