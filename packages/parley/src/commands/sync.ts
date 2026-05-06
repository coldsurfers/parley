import type { ParleyConfig } from '../core/config.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';
import { runPull } from './pull.ts';
import { runPush } from './push.ts';

export type SyncDirection = 'push' | 'pull';

export type SyncOptions = {
  direction: SyncDirection;
  /** App names to process. When unspecified, all apps in config.apps. */
  apps?: string[];
};

export type SyncDeps = {
  config: ParleyConfig;
  repoRoot: string;
  store: import('../core/ssm.ts').SsmStore;
  logger?: Logger;
};

export type PairResult = { app: string; profile: string; ok: boolean; detail: string; error?: string };

export async function runSync(opts: SyncOptions, deps: SyncDeps): Promise<{ results: PairResult[] }> {
  const log = deps.logger ?? consoleLogger;
  const targets = (opts.apps ?? Object.keys(deps.config.apps)).filter((a) => deps.config.apps[a]);
  const results: PairResult[] = [];

  for (const appName of targets) {
    const app = deps.config.apps[appName];
    if (!app) continue;
    for (const profile of app.profiles) {
      log.info(`[${opts.direction}] ${appName}/${profile}`);
      try {
        if (opts.direction === 'push') {
          const summary = await runPush(
            { app: appName, profile, yes: true },
            {
              config: deps.config,
              repoRoot: deps.repoRoot,
              store: deps.store,
              logger: deps.logger,
              nonInteractive: true,
            },
          );
          results.push({
            app: appName,
            profile,
            ok: true,
            detail: `+${summary.added.length} ~${summary.updated.length} =${summary.unchanged.length}`,
          });
        } else {
          const summary = await runPull(
            { app: appName, profile, force: true },
            {
              config: deps.config,
              repoRoot: deps.repoRoot,
              store: deps.store,
              logger: deps.logger,
              nonInteractive: true,
            },
          );
          results.push({
            app: appName,
            profile,
            ok: true,
            detail: summary.changed ? `+${summary.added} ~${summary.updated} -${summary.removed}` : 'unchanged',
          });
        }
      } catch (err) {
        const message = (err as Error).message ?? String(err);
        results.push({ app: appName, profile, ok: false, detail: 'failed', error: message });
        log.error(`${appName}/${profile}: ${message}`);
      }
    }
  }

  log.plain('');
  log.plain(`Done: ${results.filter((r) => r.ok).length}/${results.length}`);
  for (const r of results) log.dim(`  ${r.ok ? '✓' : '✗'} ${r.app}/${r.profile}  ${r.detail}`);

  return { results };
}
