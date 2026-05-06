import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ConfigNotFoundError, ConfigValidationError } from './errors.ts';
import { findConfigFile, loadConfig } from './loader.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-loader-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('findConfigFile', () => {
  it('returns immediately when found in cwd', () => {
    const file = path.join(tmpRoot, 'parley.config.ts');
    fs.writeFileSync(file, 'export default {}');
    expect(findConfigFile(tmpRoot)).toBe(file);
  });

  it('walks up to parent directories', () => {
    const file = path.join(tmpRoot, 'parley.config.ts');
    fs.writeFileSync(file, 'export default {}');
    const nested = path.join(tmpRoot, 'a', 'b', 'c');
    fs.mkdirSync(nested, { recursive: true });
    expect(findConfigFile(nested)).toBe(file);
  });

  it('throws ConfigNotFoundError when not found', () => {
    expect(() => findConfigFile(tmpRoot)).toThrow(ConfigNotFoundError);
  });
});

describe('loadConfig', () => {
  const validBody = `
    export default {
      region: 'ap-northeast-2',
      prefix: '/myorg/myproject',
      kmsKeyId: 'alias/parley',
      apps: { api: { path: 'apps/api', profiles: ['production'] } },
    };
  `;

  it('loads a valid config', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'parley.config.ts'), validBody);
    const loaded = await loadConfig({ cwd: tmpRoot });
    expect(loaded.config.region).toBe('ap-northeast-2');
    expect(loaded.repoRoot).toBe(tmpRoot);
    expect(loaded.config.apps.api?.profiles).toEqual(['production']);
  });

  it('throws ConfigValidationError when default export is missing', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'parley.config.ts'), 'export const x = 1;');
    await expect(loadConfig({ cwd: tmpRoot })).rejects.toBeInstanceOf(ConfigValidationError);
  });

  it('includes the issue path on ConfigValidationError when the schema fails', async () => {
    fs.writeFileSync(
      path.join(tmpRoot, 'parley.config.ts'),
      `export default {
        region: 'ap-northeast-2',
        prefix: '/myorg/myproject',
        kmsKeyId: 'alias/x',
        apps: {},
      };`,
    );
    try {
      await loadConfig({ cwd: tmpRoot });
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigValidationError);
      const message = (err as Error).message;
      expect(message).toContain('apps');
    }
  });
});
