import { isCancel, password } from '@clack/prompts';

import { type ParleyConfig, resolveAppProfile } from '../core/config.ts';
import { assertValidKey } from '../core/paths.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { buildDescription, type GitMeta, gitMeta } from '../lib/git.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type SetOptions = {
  app: string;
  profile: string;
  key: string;
  /** When unspecified, prompted via masked stdin input. */
  value?: string;
};

export type SetDeps = {
  config: ParleyConfig;
  repoRoot: string;
  store: SsmStore;
  logger?: Logger;
  metaProvider?: (repoRoot: string) => GitMeta;
  nonInteractive?: boolean;
};

export async function runSet(opts: SetOptions, deps: SetDeps): Promise<{ written: boolean }> {
  const log = deps.logger ?? consoleLogger;
  const { app, profile } = resolveAppProfile(deps.config, opts.app, opts.profile);
  assertValidKey(opts.key);

  let value = opts.value;
  if (value === undefined) {
    if (deps.nonInteractive) {
      throw new Error('value argument is required in non-interactive mode.');
    }
    const answer = await password({ message: `${opts.key} value (masked on input)` });
    if (isCancel(answer)) {
      log.warn('Cancelled.');
      return { written: false };
    }
    value = answer as string;
  }

  const scope: ParameterScope = { prefix: deps.config.prefix, app: app.name, profile };
  const description = buildDescription((deps.metaProvider ?? gitMeta)(deps.repoRoot));

  await deps.store.put({ scope, key: opts.key, value, kmsKeyId: deps.config.kmsKeyId, description });
  log.success(`Set: ${opts.key} (len:${value.length})`);
  return { written: true };
}
