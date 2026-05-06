import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { confirm, isCancel } from '@clack/prompts';

import { createStsClient } from '../lib/aws.ts';
import { consoleLogger, type Logger } from '../lib/logger.ts';

const CONFIG_FILE_NAME = 'parley.config.ts';

function resolveTemplatePath(): string {
  const here = fileURLToPath(import.meta.url);
  const candidates = [
    path.resolve(path.dirname(here), '..', '..', 'templates', CONFIG_FILE_NAME),
    path.resolve(path.dirname(here), '..', 'templates', CONFIG_FILE_NAME),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  throw new Error(`parley template not found. Tried:\n  - ${candidates.join('\n  - ')}`);
}

/**
 * Region used for the STS sanity check. If the user edits the template to change
 * the region, `doctor` will re-validate against the real config later. init only
 * checks "can we talk to AWS at all".
 */
const DEFAULT_REGION = 'ap-northeast-2';

export type InitOptions = { force?: boolean; skipValidation?: boolean };

export type Validators = { validateCredentials: (region: string) => Promise<{ account?: string; arn?: string }> };

export type InitDeps = { cwd?: string; logger?: Logger; nonInteractive?: boolean; validators?: Validators };

export type InitResult = { filePath: string; created: boolean; validated: { credentials: boolean } };

export async function runInit(opts: InitOptions, deps: InitDeps = {}): Promise<InitResult> {
  const log = deps.logger ?? consoleLogger;
  const cwd = deps.cwd ?? process.cwd();
  const targetDir = findRepoRoot(cwd);
  const targetPath = path.join(targetDir, CONFIG_FILE_NAME);

  const templatePath = resolveTemplatePath();
  const created = await placeTemplate(targetPath, templatePath, opts, deps, log, cwd);

  let credentials = false;

  if (!opts.skipValidation) {
    const validators = deps.validators ?? createDefaultValidators();
    try {
      log.info('Validating AWS credentials (sts:GetCallerIdentity)...');
      const ident = await validators.validateCredentials(DEFAULT_REGION);
      log.success(`account=${ident.account ?? '?'}  arn=${ident.arn ?? '?'}`);
      credentials = true;
    } catch (err) {
      log.error(`credential validation failed: ${(err as Error).message}`);
      log.dim('  Pass --skip-validation to skip, or check your AWS credentials.');
    }
  } else {
    log.warn('--skip-validation: skipping AWS credential validation.');
  }

  log.plain('');
  log.plain('Next steps:');
  log.dim(`  1) Edit prefix / region / kmsKeyId / apps in ${path.relative(cwd, targetPath)} with your own values`);
  log.dim('  2) Run `parley doctor` to verify KMS/IAM permissions');
  log.dim('  3) Run `parley diff <app> <profile>` then `parley push <app> <profile>` for your first sync');

  return { filePath: targetPath, created, validated: { credentials } };
}

async function placeTemplate(
  targetPath: string,
  templatePath: string,
  opts: InitOptions,
  deps: InitDeps,
  log: Logger,
  cwd: string,
): Promise<boolean> {
  if (!fs.existsSync(targetPath)) {
    fs.copyFileSync(templatePath, targetPath);
    log.success(`Created: ${path.relative(cwd, targetPath)}`);
    return true;
  }

  if (opts.force) {
    fs.copyFileSync(templatePath, targetPath);
    log.success(`Overwrote: ${path.relative(cwd, targetPath)}`);
    return true;
  }

  if (deps.nonInteractive) {
    log.warn(`Already exists, skipping: ${path.relative(cwd, targetPath)}`);
    return false;
  }

  const answer = await confirm({
    message: `${path.relative(cwd, targetPath)} already exists. Overwrite?`,
    initialValue: false,
  });
  if (isCancel(answer) || answer !== true) {
    log.warn('Cancelled. Keeping existing file.');
    return false;
  }

  fs.copyFileSync(templatePath, targetPath);
  log.success(`Overwrote: ${path.relative(cwd, targetPath)}`);
  return true;
}

function findRepoRoot(start: string): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: start,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (out) return out;
  } catch {
    // No git installed or not a repo — fall back to cwd
  }
  return start;
}

function createDefaultValidators(): Validators {
  return {
    async validateCredentials(region) {
      const client = createStsClient({ region });
      const res = await client.send(new GetCallerIdentityCommand({}));
      return { account: res.Account, arn: res.Arn };
    },
  };
}
