import { type AppConfig, type ParleyConfig, resolveApp, resolveAppProfile } from '../core/config.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type ListOptions = { app: string; profile?: string };
export type ListDeps = { config: ParleyConfig; store: SsmStore; logger?: Logger };

export type ListResult = { app: string; profiles: Array<{ profile: string; keys: string[] }> };

export async function runList(opts: ListOptions, deps: ListDeps): Promise<ListResult> {
  const log = deps.logger ?? consoleLogger;

  let appName: string;
  let appConfig: AppConfig;
  let targetProfiles: string[];

  if (opts.profile) {
    const r = resolveAppProfile(deps.config, opts.app, opts.profile);
    appName = r.app.name;
    appConfig = r.app.config;
    targetProfiles = [r.profile];
  } else {
    const r = resolveApp(deps.config, opts.app);
    appName = r.name;
    appConfig = r.config;
    targetProfiles = appConfig.profiles;
  }

  const profiles: ListResult['profiles'] = [];

  for (const profile of targetProfiles) {
    const scope: ParameterScope = { prefix: deps.config.prefix, app: appName, profile };
    const map = await deps.store.fetchAll(scope);
    const keys = [...map.keys()].sort();
    profiles.push({ profile, keys });

    log.plain(`${appName}/${profile}  (${keys.length} keys)`);
    for (const k of keys) log.dim(`  ${k}`);
  }

  return { app: appName, profiles };
}
