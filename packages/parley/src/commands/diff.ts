import fs from 'node:fs';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { diffMaps, hasChanges } from '../core/diff.ts';
import { parse } from '../core/dotenv.ts';
import { valueFingerprint } from '../core/mask.ts';
import { dotenvFilePath } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type DiffOptions = { app: string; profile: string };

export type DiffOutcome = {
  hasChanges: boolean;
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
};

export type DiffDeps = { config: ParleyConfig; repoRoot: string; store: SsmStore; logger?: Logger };

export async function runDiff(opts: DiffOptions, deps: DiffDeps): Promise<DiffOutcome> {
  const log = deps.logger ?? consoleLogger;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);
  const filePath = dotenvFilePath({ repoRoot: deps.repoRoot, appPath: app.config.path, profile });

  const localMap = new Map<string, string>();
  if (fs.existsSync(filePath)) {
    for (const line of parse(fs.readFileSync(filePath, 'utf8'))) {
      if (line.type === 'entry') localMap.set(line.key, line.value);
    }
  } else {
    log.warn(`local file not found: ${filePath}`);
  }

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
  const remoteMap = await deps.store.fetchAll(scope);
  const result = diffMaps(localMap, remoteMap);

  log.plain('');
  log.plain(`local=${localMap.size}  remote=${remoteMap.size}`);
  log.plain(
    `+${result.added.length}  ~${result.updated.length}  -${result.removed.length}  =${result.unchanged.length}`,
  );
  log.plain('');

  for (const key of result.added) {
    log.plain(`+ ${key}  (local: ${valueFingerprint(localMap.get(key) ?? '')})`);
  }
  for (const key of result.updated) {
    log.plain(
      `~ ${key}  (${valueFingerprint(localMap.get(key) ?? '')} → ${valueFingerprint(remoteMap.get(key) ?? '')})`,
    );
  }
  for (const key of result.removed) {
    log.plain(`- ${key}  (remote: ${valueFingerprint(remoteMap.get(key) ?? '')})`);
  }

  return {
    hasChanges: hasChanges(result),
    added: result.added,
    updated: result.updated,
    removed: result.removed,
    unchanged: result.unchanged,
  };
}
