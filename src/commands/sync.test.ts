import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ParleyConfig } from '../core/config.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { silentLogger } from '../lib/logger.ts';
import { runSync } from './sync.ts';

let tmpRoot: string;

const config: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/x/y',
  kmsKeyId: 'alias/test',
  apps: {
    api: { path: 'api', profiles: ['development', 'production'] },
    web: { path: 'web', profiles: ['production'] },
  },
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-sync-'));
  fs.mkdirSync(path.join(tmpRoot, 'api'));
  fs.mkdirSync(path.join(tmpRoot, 'web'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function fakeStore(): { store: SsmStore; pulls: number; puts: number } {
  let pulls = 0;
  let puts = 0;
  const store: SsmStore = {
    fetchAll: async (_scope: ParameterScope) => {
      pulls++;
      return new Map();
    },
    getOne: async () => null,
    put: async () => {
      puts++;
    },
    putMany: async (inputs) => {
      puts += inputs.length;
    },
    delete: async () => {},
  };
  return {
    store,
    get pulls() {
      return pulls;
    },
    get puts() {
      return puts;
    },
  };
}

describe('runSync pull', () => {
  it('processes every (app, profile) pair', async () => {
    const fake = fakeStore();
    const { results } = await runSync(
      { direction: 'pull' },
      { config, repoRoot: tmpRoot, store: fake.store, logger: silentLogger },
    );
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fake.pulls).toBe(3);
  });

  it('processes only the specified apps when --app is set', async () => {
    const fake = fakeStore();
    const { results } = await runSync(
      { direction: 'pull', apps: ['web'] },
      { config, repoRoot: tmpRoot, store: fake.store, logger: silentLogger },
    );
    expect(results.map((r) => r.app)).toEqual(['web']);
    expect(fake.pulls).toBe(1);
  });

  it('records failed pairs as ok=false and keeps going', async () => {
    let call = 0;
    const store: SsmStore = {
      fetchAll: async () => {
        call++;
        if (call === 1) throw new Error('forced');
        return new Map();
      },
      getOne: async () => null,
      put: async () => {},
      putMany: async () => {},
      delete: async () => {},
    };

    const { results } = await runSync(
      { direction: 'pull' },
      { config, repoRoot: tmpRoot, store, logger: silentLogger },
    );

    expect(results.filter((r) => r.ok).length).toBe(2);
    expect(results.filter((r) => !r.ok).length).toBe(1);
  });
});

describe('runSync push', () => {
  it('records pairs without a local file as failures', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'A=1');
    // production and web have no file -> failure

    const fake = fakeStore();
    const { results } = await runSync(
      { direction: 'push' },
      { config, repoRoot: tmpRoot, store: fake.store, logger: silentLogger },
    );

    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok).length).toBe(1);
    expect(results.filter((r) => !r.ok).length).toBe(2);
  });
});
