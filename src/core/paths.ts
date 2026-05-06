import path from 'node:path';

export const DEFAULT_PROFILE = '_default';

const APP_SEGMENT = /^[a-z][a-z0-9-]*$/;
const PROFILE_SEGMENT = /^[A-Za-z0-9_]+$/;
const KEY_SEGMENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const PREFIX_PATTERN = /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

export function assertValidPrefix(prefix: string): void {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`prefix must start with '/' and not end with '/': '${prefix}'`);
  }
}

export function assertValidApp(app: string): void {
  if (!APP_SEGMENT.test(app)) {
    throw new Error(`app must start with a lowercase letter and contain only lowercase, digits, or hyphens: '${app}'`);
  }
}

export function assertValidProfile(profile: string): void {
  if (!PROFILE_SEGMENT.test(profile)) {
    throw new Error(`profile must be alphanumeric or underscore: '${profile}'`);
  }
}

export function assertValidKey(key: string): void {
  if (!KEY_SEGMENT.test(key)) {
    throw new Error(`env var key must start with a letter and contain only alphanumerics or underscores: '${key}'`);
  }
}

export function ssmPrefixFor(args: { prefix: string; app: string; profile: string }): string {
  assertValidPrefix(args.prefix);
  assertValidApp(args.app);
  assertValidProfile(args.profile);
  return `${args.prefix}/${args.app}/${args.profile}`;
}

export function ssmPathFor(args: { prefix: string; app: string; profile: string; key: string }): string {
  assertValidKey(args.key);
  return `${ssmPrefixFor(args)}/${args.key}`;
}

export type ParsedSsmPath = { app: string; profile: string; key: string };

export function parseSsmPath(prefix: string, fullPath: string): ParsedSsmPath | null {
  assertValidPrefix(prefix);
  if (!fullPath.startsWith(`${prefix}/`)) return null;

  const remainder = fullPath.slice(prefix.length + 1);
  const segments = remainder.split('/');
  if (segments.length !== 3) return null;

  const [app, profile, key] = segments as [string, string, string];
  if (!APP_SEGMENT.test(app)) return null;
  if (!PROFILE_SEGMENT.test(profile)) return null;
  if (!KEY_SEGMENT.test(key)) return null;

  return { app, profile, key };
}

export function dotenvFileName(profile: string): string {
  assertValidProfile(profile);
  return profile === DEFAULT_PROFILE ? '.env' : `.env.${profile}`;
}

export function dotenvFilePath(args: { repoRoot: string; appPath: string; profile: string }): string {
  return path.join(args.repoRoot, args.appPath, dotenvFileName(args.profile));
}
