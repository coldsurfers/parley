import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ParleyConfig } from '../core/config.ts';
import type { ParameterScope, PutInput, SsmStore } from '../core/ssm.ts';
import type { GitMeta } from '../lib/git.ts';
import { silentLogger } from '../lib/logger.ts';
import { runPush } from './push.ts';

let tmpRoot: string;

const config: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/x/y',
  kmsKeyId: 'alias/test',
  apps: { api: { path: 'api', profiles: ['development'] } },
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-push-'));
  fs.mkdirSync(path.join(tmpRoot, 'api'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function createFakeStore(remote: Map<string, string>): { store: SsmStore; puts: PutInput[]; deletes: string[] } {
  const puts: PutInput[] = [];
  const deletes: string[] = [];
  const store: SsmStore = {
    fetchAll: async (_scope: ParameterScope) => new Map(remote),
    getOne: async ({ key }) => remote.get(key) ?? null,
    put: async (input) => {
      puts.push(input);
    },
    putMany: async (inputs) => {
      puts.push(...inputs);
    },
    delete: async ({ key }) => {
      deletes.push(key);
    },
  };
  return { store, puts, deletes };
}

const meta: GitMeta = { user: 'test@example.com', sha: 'abc12345', at: '2026-05-06T00:00:00.000Z' };
const metaProvider = () => meta;

describe('runPush', () => {
  it('only puts changed entries to SSM', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'NEW=1\nCHANGED=new\nSAME=x\n');
    const { store, puts } = createFakeStore(
      new Map([
        ['CHANGED', 'old'],
        ['SAME', 'x'],
        ['ORPHAN', 'o'],
      ]),
    );

    const summary = await runPush(
      { app: 'api', profile: 'development', yes: true },
      { config, repoRoot: tmpRoot, store, logger: silentLogger, metaProvider, nonInteractive: true },
    );

    expect(summary.added).toEqual(['NEW']);
    expect(summary.updated).toEqual(['CHANGED']);
    expect(summary.unchanged).toEqual(['SAME']);
    expect(summary.remoteOnly).toEqual(['ORPHAN']);

    expect(puts).toHaveLength(2);
    expect(puts.map((p) => p.key).sort()).toEqual(['CHANGED', 'NEW']);
    expect(puts.every((p) => p.kmsKeyId === 'alias/test')).toBe(true);
    expect(puts.every((p) => p.description === `pushed-by=test@example.com;sha=abc12345;at=${meta.at}`)).toBe(true);
  });

  it('dry-run skips SSM calls', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'NEW=1\n');
    const { store, puts } = createFakeStore(new Map());

    const summary = await runPush(
      { app: 'api', profile: 'development', dryRun: true },
      { config, repoRoot: tmpRoot, store, logger: silentLogger, metaProvider, nonInteractive: true },
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.added).toEqual(['NEW']);
    expect(puts).toHaveLength(0);
  });

  it('makes zero put calls when nothing changed', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'A=1\n');
    const { store, puts } = createFakeStore(new Map([['A', '1']]));

    await runPush(
      { app: 'api', profile: 'development', yes: true },
      { config, repoRoot: tmpRoot, store, logger: silentLogger, metaProvider, nonInteractive: true },
    );

    expect(puts).toHaveLength(0);
  });

  it('errors when the local file is missing', async () => {
    const { store } = createFakeStore(new Map());
    await expect(
      runPush(
        { app: 'api', profile: 'development', yes: true },
        { config, repoRoot: tmpRoot, store, logger: silentLogger, metaProvider, nonInteractive: true },
      ),
    ).rejects.toThrow(/local file not found/);
  });
});
