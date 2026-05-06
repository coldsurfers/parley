import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { silentLogger } from '../lib/logger.ts';
import { runInit, type Validators } from './init.ts';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-init-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const okValidators: Validators = {
  validateCredentials: async () => ({ account: '111111111111', arn: 'arn:aws:iam::111:user/test' }),
};

describe('runInit', () => {
  it('copies the template and only validates STS when the file is missing', async () => {
    const result = await runInit(
      {},
      { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators: okValidators },
    );

    expect(result.created).toBe(true);
    expect(fs.existsSync(result.filePath)).toBe(true);
    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toContain('defineConfig');
    expect(content).toContain('apps:');
    expect(result.validated.credentials).toBe(true);
  });

  it('skips when the file exists in nonInteractive mode', async () => {
    const target = path.join(tmpRoot, 'parley.config.ts');
    fs.writeFileSync(target, 'existing');

    const result = await runInit(
      {},
      { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators: okValidators },
    );

    expect(result.created).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toBe('existing');
  });

  it('overwrites the existing file with --force', async () => {
    const target = path.join(tmpRoot, 'parley.config.ts');
    fs.writeFileSync(target, 'existing');

    const result = await runInit(
      { force: true },
      { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators: okValidators },
    );

    expect(result.created).toBe(true);
    expect(fs.readFileSync(target, 'utf8')).toContain('defineConfig');
  });

  it('--skip-validation skips the validator call', async () => {
    let called = 0;
    const validators: Validators = {
      validateCredentials: async () => {
        called++;
        return {};
      },
    };

    const result = await runInit(
      { skipValidation: true },
      { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators },
    );

    expect(result.created).toBe(true);
    expect(called).toBe(0);
    expect(result.validated.credentials).toBe(false);
  });

  it('proceeds with init even when STS fails (file still created)', async () => {
    const validators: Validators = {
      validateCredentials: async () => {
        throw new Error('NoCredentialProviders');
      },
    };

    const result = await runInit({}, { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators });

    expect(result.created).toBe(true);
    expect(result.validated.credentials).toBe(false);
  });

  it('the created file has the same structure as the template', async () => {
    const result = await runInit(
      { skipValidation: true },
      { cwd: tmpRoot, logger: silentLogger, nonInteractive: true, validators: okValidators },
    );

    const content = fs.readFileSync(result.filePath, 'utf8');
    expect(content).toMatch(/import \{ defineConfig \} from ['"]@coldsurf\/parley\/config['"]/);
    expect(content).toMatch(/region:\s*['"]ap-northeast-2['"]/);
    expect(content).toMatch(/prefix:\s*['"]\/myorg\/myproject['"]/);
    expect(content).toMatch(/kmsKeyId:/);
    expect(content).toMatch(/apps:\s*\{/);
  });
});
