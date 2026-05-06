import { describe, expect, it } from 'vitest';

import type { ParleyConfig } from '../core/config.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { silentLogger } from '../lib/logger.ts';
import { runRun } from './run.ts';

const config: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/x/y',
  kmsKeyId: 'alias/test',
  apps: { api: { path: 'api', profiles: ['development', 'production'] }, web: { path: 'web', profiles: ['staging'] } },
};

function fakeStore(byScope: Record<string, Record<string, string>>): SsmStore {
  return {
    fetchAll: async (scope: ParameterScope) => {
      const key = `${scope.app}/${scope.profile}`;
      return new Map(Object.entries(byScope[key] ?? {}));
    },
    getOne: async () => null,
    put: async () => {},
    putMany: async () => {},
    delete: async () => {},
  };
}

describe('runRun', () => {
  it('injects env from a single pair into the child', async () => {
    const store = fakeStore({ 'api/development': { A: '1', B: 'two' } });
    let injected: NodeJS.ProcessEnv = {};
    const result = await runRun(
      { apps: ['api'], profiles: ['development'], command: 'true', args: [] },
      {
        config,
        store,
        logger: silentLogger,
        spawnImpl: async (_cmd, _args, env) => {
          injected = env;
          return 0;
        },
      },
    );
    expect(result.exitCode).toBe(0);
    expect(injected.A).toBe('1');
    expect(injected.B).toBe('two');
    expect(result.injectedKeys).toEqual(['A', 'B']);
  });

  it('merges multiple pairs — later wins', async () => {
    const store = fakeStore({
      'api/development': { A: 'first', SHARED: 'api' },
      'web/staging': { B: 'second', SHARED: 'web' },
    });
    let injected: NodeJS.ProcessEnv = {};
    await runRun(
      { apps: ['api', 'web'], profiles: ['development', 'staging'], command: 'true', args: [] },
      {
        config,
        store,
        logger: silentLogger,
        spawnImpl: async (_c, _a, env) => {
          injected = env;
          return 0;
        },
      },
    );
    expect(injected.A).toBe('first');
    expect(injected.B).toBe('second');
    expect(injected.SHARED).toBe('web'); // later wins
  });

  it('errors when --app and --profile lengths differ', async () => {
    await expect(
      runRun(
        { apps: ['api'], profiles: [], command: 'true', args: [] },
        { config, store: fakeStore({}), logger: silentLogger, spawnImpl: async () => 0 },
      ),
    ).rejects.toThrow(/same number of times/);
  });

  it('passes the exit code through', async () => {
    const result = await runRun(
      { apps: ['api'], profiles: ['development'], command: 'true', args: [] },
      { config, store: fakeStore({}), logger: silentLogger, spawnImpl: async () => 42 },
    );
    expect(result.exitCode).toBe(42);
  });
});
