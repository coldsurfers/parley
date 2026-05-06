import fs from 'node:fs';
import path from 'node:path';

import { createJiti } from 'jiti';
import type { z } from 'zod';

import { type ParleyConfig, ParleyConfigSchema } from './config.ts';
import { ConfigNotFoundError, ConfigValidationError } from './errors.ts';

export const CONFIG_FILE_NAME = 'parley.config.ts';

export type LoadedConfig = { config: ParleyConfig; configPath: string; repoRoot: string };

export function findConfigFile(startDir: string): string {
  let current = path.resolve(startDir);
  while (true) {
    const candidate = path.join(current, CONFIG_FILE_NAME);
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) throw new ConfigNotFoundError(startDir);
    current = parent;
  }
}

export async function loadConfig(opts?: { cwd?: string }): Promise<LoadedConfig> {
  const cwd = opts?.cwd ?? process.cwd();
  const configPath = findConfigFile(cwd);

  const jiti = createJiti(import.meta.url, { interopDefault: false, moduleCache: false });
  const mod = (await jiti.import(configPath)) as { default?: unknown };

  if (mod.default === undefined) {
    throw new ConfigValidationError(configPath, [
      "a default export is required (e.g., 'export default defineConfig({...})')",
    ]);
  }

  const result = ParleyConfigSchema.safeParse(mod.default);
  if (!result.success) {
    throw new ConfigValidationError(configPath, formatZodIssues(result.error));
  }

  return { config: result.data, configPath, repoRoot: path.dirname(configPath) };
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length ? issue.path.join('.') : '<root>';
    return `${where}: ${issue.message}`;
  });
}
