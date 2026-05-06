import fs from 'node:fs';

import { confirm, isCancel } from '@clack/prompts';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { diffMaps, hasChanges } from '../core/diff.ts';
import { parse, toMap } from '../core/dotenv.ts';
import { dotenvFilePath } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { buildDescription, type GitMeta, gitMeta } from '../lib/git.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type PushOptions = { app: string; profile: string; dryRun?: boolean; yes?: boolean };

export type PushSummary = {
  added: string[];
  updated: string[];
  unchanged: string[];
  remoteOnly: string[];
  dryRun: boolean;
};

export type PushDeps = {
  config: ParleyConfig;
  repoRoot: string;
  store: SsmStore;
  logger?: Logger;
  metaProvider?: (repoRoot: string) => GitMeta;
  /** Non-interactive mode (CI). When true, equivalent to yes. */
  nonInteractive?: boolean;
};

export async function runPush(opts: PushOptions, deps: PushDeps): Promise<PushSummary> {
  const log = deps.logger ?? consoleLogger;
  const metaFn = deps.metaProvider ?? gitMeta;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);

  const filePath = dotenvFilePath({ repoRoot: deps.repoRoot, appPath: app.config.path, profile });
  if (!fs.existsSync(filePath)) {
    throw new Error(`local file not found: ${filePath}`);
  }
  const localContent = fs.readFileSync(filePath, 'utf8');
  const localLines = parse(localContent);
  const localMap = toMap(localLines);

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
  log.info(`Fetching remote: ${scope.prefix}/${scope.app}/${scope.profile}`);
  const remoteMap = await deps.store.fetchAll(scope);

  const diff = diffMaps(localMap, remoteMap);

  log.plain('');
  log.plain(`local=${localMap.size}  remote=${remoteMap.size}`);
  log.plain(
    `+${diff.added.length}  ~${diff.updated.length}  =${diff.unchanged.length}  (remote-only: ${diff.removed.length})`,
  );
  if (diff.added.length) log.dim(`  added:    ${diff.added.join(', ')}`);
  if (diff.updated.length) log.dim(`  updated:  ${diff.updated.join(', ')}`);
  if (diff.removed.length) log.dim(`  remoteOnly: ${diff.removed.join(', ')}  (push does not auto-delete)`);

  const summary: PushSummary = {
    added: diff.added,
    updated: diff.updated,
    unchanged: diff.unchanged,
    remoteOnly: diff.removed,
    dryRun: opts.dryRun ?? false,
  };

  if (!hasChanges(diff)) {
    log.success('No changes. Skipping SSM calls.');
    return summary;
  }
  if (opts.dryRun) {
    log.info('--dry-run: skipping SSM calls.');
    return summary;
  }

  if (!opts.yes && !deps.nonInteractive) {
    const proceed = await confirm({ message: `Write ${diff.added.length + diff.updated.length} parameter(s) to SSM?` });
    if (isCancel(proceed) || proceed !== true) {
      log.warn('Cancelled.');
      return summary;
    }
  }

  const meta = metaFn(deps.repoRoot);
  const description = buildDescription(meta);
  const inputs = [...diff.added, ...diff.updated].map((key) => ({
    scope,
    key,
    // biome-ignore lint/style/noNonNullAssertion: diff result only contains keys from localMap
    value: localMap.get(key)!,
    kmsKeyId: deps.config.kmsKeyId,
    description,
  }));

  await deps.store.putMany(inputs);
  log.success(`Done: +${diff.added.length} ~${diff.updated.length}`);
  return summary;
}
