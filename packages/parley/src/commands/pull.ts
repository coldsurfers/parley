import fs from 'node:fs';
import path from 'node:path';

import { confirm, isCancel } from '@clack/prompts';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { fromMap, merge, parse, serialize } from '../core/dotenv.ts';
import { dotenvFilePath } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type PullOptions = { app: string; profile: string; force?: boolean };

export type PullSummary = {
  filePath: string;
  changed: boolean;
  remoteCount: number;
  added: number;
  updated: number;
  removed: number;
};

export type PullDeps = {
  config: ParleyConfig;
  repoRoot: string;
  store: SsmStore;
  logger?: Logger;
  nonInteractive?: boolean;
};

export async function runPull(opts: PullOptions, deps: PullDeps): Promise<PullSummary> {
  const log = deps.logger ?? consoleLogger;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);
  const filePath = dotenvFilePath({ repoRoot: deps.repoRoot, appPath: app.config.path, profile });

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
  log.info(`Fetching remote: ${scope.prefix}/${scope.app}/${scope.profile}`);
  const remoteMap = await deps.store.fetchAll(scope);

  const exists = fs.existsSync(filePath);
  const before = exists ? fs.readFileSync(filePath, 'utf8') : '';
  const localLines = exists ? parse(before) : [];

  const localMap = new Map<string, string>();
  for (const line of localLines) {
    if (line.type === 'entry') localMap.set(line.key, line.value);
  }

  let added = 0;
  let updated = 0;
  let removed = 0;
  for (const [key, value] of remoteMap) {
    if (!localMap.has(key)) added++;
    else if (localMap.get(key) !== value) updated++;
  }
  for (const key of localMap.keys()) {
    if (!remoteMap.has(key)) removed++;
  }

  const merged = exists ? merge(localLines, remoteMap, { removeMissing: true }) : fromMap(remoteMap);
  const after = serialize(merged);
  const changed = after !== before;

  log.plain('');
  log.plain(`+${added}  ~${updated}  -${removed}  remote=${remoteMap.size}`);
  log.plain(`file: ${path.relative(deps.repoRoot, filePath)}${exists ? '' : ' (new)'}`);

  const summary: PullSummary = { filePath, changed, remoteCount: remoteMap.size, added, updated, removed };

  if (!changed) {
    log.success('No changes. File not rewritten.');
    return summary;
  }

  if (exists && !opts.force && !deps.nonInteractive) {
    const proceed = await confirm({ message: `Overwrite ${path.basename(filePath)}?` });
    if (isCancel(proceed) || proceed !== true) {
      log.warn('Cancelled.');
      return summary;
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, after, 'utf8');
  log.success(`Wrote: ${path.relative(deps.repoRoot, filePath)}`);
  return summary;
}
