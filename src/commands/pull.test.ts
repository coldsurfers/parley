import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ParleyConfig } from '../core/config.ts';
import type { ParameterScope, SsmStore } from '../core/ssm.ts';
import { silentLogger } from '../lib/logger.ts';
import { runPull } from './pull.ts';

let tmpRoot: string;

const config: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/x/y',
  kmsKeyId: 'alias/test',
  apps: { api: { path: 'api', profiles: ['development'] } },
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-pull-'));
  fs.mkdirSync(path.join(tmpRoot, 'api'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function fakeStore(remote: Map<string, string>): SsmStore {
  return {
    fetchAll: async (_scope: ParameterScope) => new Map(remote),
    getOne: async ({ key }) => remote.get(key) ?? null,
    put: async () => {},
    putMany: async () => {},
    delete: async () => {},
  };
}

describe('runPull', () => {
  it('creates the file when it does not exist', async () => {
    const filePath = path.join(tmpRoot, 'api', '.env.development');
    const summary = await runPull(
      { app: 'api', profile: 'development', force: true },
      {
        config,
        repoRoot: tmpRoot,
        store: fakeStore(
          new Map([
            ['A', '1'],
            ['B', 'with space'],
          ]),
        ),
        logger: silentLogger,
        nonInteractive: true,
      },
    );
    expect(summary.changed).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('A=1\nB="with space"\n');
  });

  it('does not rewrite when content matches the existing file', async () => {
    const filePath = path.join(tmpRoot, 'api', '.env.development');
    fs.writeFileSync(filePath, 'A=1\n');
    const before = fs.statSync(filePath).mtimeMs;
    await new Promise((r) => setTimeout(r, 5));

    const summary = await runPull(
      { app: 'api', profile: 'development', force: true },
      {
        config,
        repoRoot: tmpRoot,
        store: fakeStore(new Map([['A', '1']])),
        logger: silentLogger,
        nonInteractive: true,
      },
    );
    expect(summary.changed).toBe(false);
    expect(fs.statSync(filePath).mtimeMs).toBe(before);
  });

  it('updates with remote values while preserving comments and order', async () => {
    const filePath = path.join(tmpRoot, 'api', '.env.development');
    fs.writeFileSync(filePath, '# header\n\nA=old\nB=keep\n');

    await runPull(
      { app: 'api', profile: 'development', force: true },
      {
        config,
        repoRoot: tmpRoot,
        store: fakeStore(
          new Map([
            ['A', 'new'],
            ['B', 'keep'],
            ['C', 'added'],
          ]),
        ),
        logger: silentLogger,
        nonInteractive: true,
      },
    );

    expect(fs.readFileSync(filePath, 'utf8')).toBe('# header\n\nA=new\nB=keep\n\nC=added\n');
  });

  it('removes local keys missing from remote (removeMissing=true by default)', async () => {
    const filePath = path.join(tmpRoot, 'api', '.env.development');
    fs.writeFileSync(filePath, 'A=1\nLOCAL_ONLY=x\n');

    await runPull(
      { app: 'api', profile: 'development', force: true },
      {
        config,
        repoRoot: tmpRoot,
        store: fakeStore(new Map([['A', '1']])),
        logger: silentLogger,
        nonInteractive: true,
      },
    );

    expect(fs.readFileSync(filePath, 'utf8')).toBe('A=1\n');
  });
});
