import fs from 'node:fs';
import path from 'node:path';

import { DescribeKeyCommand } from '@aws-sdk/client-kms';
import { DescribeParametersCommand, type ParameterStringFilter } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';

import type { ParleyConfig } from '../core/config.ts';
import { dotenvFileName } from '../core/paths.ts';
import { createKmsClient, createSsmClient, createStsClient } from '../lib/aws.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

export type CheckOutcome = { name: string; ok: boolean; detail?: string };

export type DoctorDeps = { config: ParleyConfig; repoRoot: string; logger?: Logger; validators?: DoctorValidators };

export type DoctorValidators = {
  validateCredentials: (region: string) => Promise<{ account?: string; arn?: string }>;
  validateSsmRead: (region: string, prefix: string) => Promise<{ count?: number }>;
  validateKmsKey: (region: string, keyId: string) => Promise<{ keyId?: string; arn?: string }>;
};

export type DoctorReport = { ok: boolean; checks: CheckOutcome[] };

export async function runDoctor(deps: DoctorDeps): Promise<DoctorReport> {
  const log = deps.logger ?? consoleLogger;
  const v = deps.validators ?? createDefaultValidators();
  const checks: CheckOutcome[] = [];

  log.info('1) AWS credentials (sts:GetCallerIdentity)');
  try {
    const ident = await v.validateCredentials(deps.config.region);
    checks.push({ name: 'sts:GetCallerIdentity', ok: true, detail: `account=${ident.account ?? '?'}` });
  } catch (err) {
    checks.push({ name: 'sts:GetCallerIdentity', ok: false, detail: (err as Error).message });
  }

  log.info(`2) SSM read permission (ssm:DescribeParameters, prefix=${deps.config.prefix})`);
  try {
    const r = await v.validateSsmRead(deps.config.region, deps.config.prefix);
    checks.push({ name: 'ssm:DescribeParameters', ok: true, detail: `${r.count ?? 0} prefix matches` });
  } catch (err) {
    checks.push({ name: 'ssm:DescribeParameters', ok: false, detail: (err as Error).message });
  }

  log.info(`3) KMS key (kms:DescribeKey ${deps.config.kmsKeyId})`);
  try {
    const k = await v.validateKmsKey(deps.config.region, deps.config.kmsKeyId);
    checks.push({ name: 'kms:DescribeKey', ok: true, detail: `keyId=${k.keyId ?? '?'}` });
  } catch (err) {
    checks.push({ name: 'kms:DescribeKey', ok: false, detail: (err as Error).message });
  }

  log.info('4) mapping check (.env.* files not declared in config)');
  const missing = findUnmappedDotenvFiles(deps.config, deps.repoRoot);
  if (missing.length === 0) {
    checks.push({ name: 'mapping:complete', ok: true, detail: 'all .env.* files mapped' });
  } else {
    checks.push({
      name: 'mapping:complete',
      ok: false,
      detail: `${missing.length} unmapped: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
    });
  }

  log.plain('');
  for (const c of checks) {
    if (c.ok) log.success(`${c.name}  ${c.detail ?? ''}`);
    else log.error(`${c.name}  ${c.detail ?? ''}`);
  }
  const ok = checks.every((c) => c.ok);
  log.plain('');
  if (ok) log.success('all checks passed');
  else log.warn('some checks failed');

  return { ok, checks };
}

/**
 * Within the paths declared in config.apps, find .env / .env.<profile> files
 * that don't match any of that app's profiles.
 * (.env.* files outside those paths are out of scope and ignored.)
 */
function findUnmappedDotenvFiles(config: ParleyConfig, repoRoot: string): string[] {
  const out: string[] = [];
  for (const [appName, app] of Object.entries(config.apps)) {
    const dir = path.join(repoRoot, app.path);
    if (!fs.existsSync(dir)) continue;
    const allowed = new Set(app.profiles.map(dotenvFileName));
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isFile()) continue;
      if (ent.name !== '.env' && !ent.name.startsWith('.env.')) continue;
      if (ent.name === '.env.example') continue;
      if (!allowed.has(ent.name)) {
        out.push(`${appName}: ${path.relative(repoRoot, path.join(dir, ent.name))}`);
      }
    }
  }
  return out;
}

function createDefaultValidators(): DoctorValidators {
  return {
    async validateCredentials(region) {
      const c = createStsClient({ region });
      const r = await c.send(new GetCallerIdentityCommand({}));
      return { account: r.Account, arn: r.Arn };
    },
    async validateSsmRead(region, prefix) {
      const c = createSsmClient({ region });
      const filter: ParameterStringFilter = { Key: 'Name', Option: 'BeginsWith', Values: [prefix] };
      const r = await c.send(new DescribeParametersCommand({ ParameterFilters: [filter], MaxResults: 50 }));
      return { count: r.Parameters?.length };
    },
    async validateKmsKey(region, keyId) {
      const c = createKmsClient({ region });
      const r = await c.send(new DescribeKeyCommand({ KeyId: keyId }));
      return { keyId: r.KeyMetadata?.KeyId, arn: r.KeyMetadata?.Arn };
    },
  };
}
