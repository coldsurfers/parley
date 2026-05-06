import { confirm, isCancel } from '@clack/prompts';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { assertValidKey } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type UnsetOptions = { app: string; profile: string; key: string; yes?: boolean };
export type UnsetDeps = { config: ParleyConfig; store: SsmStore; logger?: Logger; nonInteractive?: boolean };

export async function runUnset(opts: UnsetOptions, deps: UnsetDeps): Promise<{ deleted: boolean }> {
  const log = deps.logger ?? consoleLogger;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);
  assertValidKey(opts.key);

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };

  if (!opts.yes && !deps.nonInteractive) {
    const ok = await confirm({ message: `Really delete ${app.name}/${profile}/${opts.key}?`, initialValue: false });
    if (isCancel(ok) || ok !== true) {
      log.warn('Cancelled.');
      return { deleted: false };
    }
  }

  await deps.store.delete({ scope, key: opts.key });
  log.success(`Deleted: ${opts.key}`);
  return { deleted: true };
}
