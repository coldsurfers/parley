import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { maskValue, valueFingerprint } from '../core/mask.ts';
import { assertValidKey } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type GetOptions = { app: string; profile: string; key: string; reveal?: boolean };
export type GetDeps = { config: ParleyConfig; store: SsmStore; logger?: Logger };

export type GetResult = { found: boolean; value: string | null };

export async function runGet(opts: GetOptions, deps: GetDeps): Promise<GetResult> {
  const log = deps.logger ?? consoleLogger;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);
  assertValidKey(opts.key);

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
  const value = await deps.store.getOne({ scope, key: opts.key });

  if (value === null) {
    log.warn(`key not found: ${opts.key}`);
    return { found: false, value: null };
  }

  if (opts.reveal) {
    log.plain(value);
  } else {
    log.plain(`${maskValue(value)}  (sha:${valueFingerprint(value)}, len:${value.length})`);
    log.dim('  pass --reveal to see the raw value');
  }
  return { found: true, value };
}
