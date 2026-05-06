import { z } from 'zod';

import { UnknownAppError, UnknownProfileError } from './errors.ts';

export const ProfileNameSchema = z.string().regex(/^[A-Za-z0-9_]+$/, 'profile must be alphanumeric or underscore');

export const AppNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, 'app must start with a lowercase letter and contain only lowercase, digits, or hyphens');

export const PrefixSchema = z
  .string()
  .regex(/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/, "prefix must start with '/' and not end with '/'");

export const AppConfigSchema = z.object({
  path: z.string().min(1, 'path must not be empty'),
  profiles: z.array(ProfileNameSchema).min(1, 'at least one profile is required'),
});

export const ParleyConfigSchema = z
  .object({
    region: z.string().min(1, 'region must not be empty'),
    prefix: PrefixSchema,
    kmsKeyId: z.string().min(1, 'kmsKeyId must not be empty'),
    apps: z.record(AppNameSchema, AppConfigSchema),
  })
  .refine((c) => Object.keys(c.apps).length > 0, { message: 'apps must define at least one entry', path: ['apps'] });

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type ParleyConfig = z.infer<typeof ParleyConfigSchema>;

export function defineConfig(config: ParleyConfig): ParleyConfig {
  return ParleyConfigSchema.parse(config);
}

export type ResolvedApp = { name: string; config: AppConfig };

export function resolveApp(config: ParleyConfig, app: string): ResolvedApp {
  const appConfig = config.apps[app];
  if (!appConfig) throw new UnknownAppError(app, Object.keys(config.apps));
  return { name: app, config: appConfig };
}

export function resolveAppProfile(
  config: ParleyConfig,
  app: string,
  profile: string,
): { app: ResolvedApp; profile: string } {
  const resolved = resolveApp(config, app);
  if (!resolved.config.profiles.includes(profile)) {
    throw new UnknownProfileError(app, profile, resolved.config.profiles);
  }
  return { app: resolved, profile };
}
