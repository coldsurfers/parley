import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ParleyConfig } from '../core/config.ts';
import { silentLogger } from '../lib/logger.ts';
import { type DoctorValidators, runDoctor } from './doctor.ts';

let tmpRoot: string;

const config: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/x/y',
  kmsKeyId: 'alias/test',
  apps: { api: { path: 'api', profiles: ['development', 'production'] } },
};

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'parley-doctor-'));
  fs.mkdirSync(path.join(tmpRoot, 'api'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const okValidators: DoctorValidators = {
  validateCredentials: async () => ({ account: '1', arn: 'arn:aws:iam::1:user/x' }),
  validateSsmRead: async () => ({ count: 7 }),
  validateKmsKey: async () => ({ keyId: 'k1', arn: 'arn:aws:kms:...:key/k1' }),
};

describe('runDoctor', () => {
  it('passes all checks', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'A=1');
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.production'), 'A=1');

    const report = await runDoctor({ config, repoRoot: tmpRoot, logger: silentLogger, validators: okValidators });
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual([
      'sts:GetCallerIdentity',
      'ssm:DescribeParameters',
      'kms:DescribeKey',
      'mapping:complete',
    ]);
    expect(report.checks.every((c) => c.ok)).toBe(true);
  });

  it('continues remaining checks even if STS fails', async () => {
    const validators: DoctorValidators = {
      ...okValidators,
      validateCredentials: async () => {
        throw new Error('NoCredentials');
      },
    };
    const report = await runDoctor({ config, repoRoot: tmpRoot, logger: silentLogger, validators });
    expect(report.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'sts:GetCallerIdentity')?.ok).toBe(false);
    expect(report.checks.find((c) => c.name === 'kms:DescribeKey')?.ok).toBe(true);
  });

  it('detects unmapped .env.* files', async () => {
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.development'), 'A=1');
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.production'), 'A=1');
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.staging'), 'A=1'); // unmapped
    fs.writeFileSync(path.join(tmpRoot, 'api', '.env.example'), 'A='); // ignored

    const report = await runDoctor({ config, repoRoot: tmpRoot, logger: silentLogger, validators: okValidators });
    const mapping = report.checks.find((c) => c.name === 'mapping:complete');
    expect(mapping?.ok).toBe(false);
    expect(mapping?.detail).toContain('staging');
    expect(mapping?.detail).not.toContain('example');
  });

  it('passes when mapped files do not exist (only existing files are checked)', async () => {
    const report = await runDoctor({ config, repoRoot: tmpRoot, logger: silentLogger, validators: okValidators });
    expect(report.checks.find((c) => c.name === 'mapping:complete')?.ok).toBe(true);
  });
});
