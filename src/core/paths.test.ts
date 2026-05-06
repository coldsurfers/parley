import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE, dotenvFileName, dotenvFilePath, parseSsmPath, ssmPathFor, ssmPrefixFor } from './paths.ts';

const PREFIX = '/myorg/myproject';

describe('ssmPrefixFor', () => {
  it('joins prefix/app/profile', () => {
    expect(ssmPrefixFor({ prefix: PREFIX, app: 'web-edge', profile: 'development' })).toBe(
      '/myorg/myproject/web-edge/development',
    );
  });

  it('rejects invalid prefix', () => {
    expect(() => ssmPrefixFor({ prefix: 'no-leading-slash', app: 'api', profile: 'production' })).toThrow();
    expect(() => ssmPrefixFor({ prefix: '/trailing/', app: 'api', profile: 'production' })).toThrow();
  });

  it('rejects invalid app names', () => {
    expect(() => ssmPrefixFor({ prefix: PREFIX, app: 'Web_Service', profile: 'production' })).toThrow();
  });

  it('rejects invalid profile names', () => {
    expect(() => ssmPrefixFor({ prefix: PREFIX, app: 'api', profile: 'with-hyphen' })).toThrow();
  });
});

describe('ssmPathFor', () => {
  it('builds the full path', () => {
    expect(ssmPathFor({ prefix: PREFIX, app: 'api', profile: 'production', key: 'APP_API_BASE_URL' })).toBe(
      '/myorg/myproject/api/production/APP_API_BASE_URL',
    );
  });

  it('rejects invalid keys', () => {
    expect(() => ssmPathFor({ prefix: PREFIX, app: 'api', profile: 'production', key: '1NUMERIC_FIRST' })).toThrow();
    expect(() => ssmPathFor({ prefix: PREFIX, app: 'api', profile: 'production', key: 'BAD-KEY' })).toThrow();
    expect(() => ssmPathFor({ prefix: PREFIX, app: 'api', profile: 'production', key: 'BAD/KEY' })).toThrow();
  });
});

describe('parseSsmPath', () => {
  it('splits a valid path', () => {
    expect(parseSsmPath(PREFIX, '/myorg/myproject/api/production/APP_API_BASE_URL')).toEqual({
      app: 'api',
      profile: 'production',
      key: 'APP_API_BASE_URL',
    });
  });

  it('returns null when prefix differs', () => {
    expect(parseSsmPath(PREFIX, '/other/api/production/X')).toBeNull();
  });

  it('returns null on wrong segment count', () => {
    expect(parseSsmPath(PREFIX, '/myorg/myproject/api/production')).toBeNull();
    expect(parseSsmPath(PREFIX, '/myorg/myproject/api/production/X/EXTRA')).toBeNull();
  });

  it('returns null on invalid segment', () => {
    expect(parseSsmPath(PREFIX, '/myorg/myproject/API/production/X')).toBeNull();
    expect(parseSsmPath(PREFIX, '/myorg/myproject/api/with-hyphen/X')).toBeNull();
  });

  it('roundtrips with ssmPathFor', () => {
    const original = { prefix: PREFIX, app: 'web-edge', profile: 'development', key: 'VITE_FOO_BAR' };
    const full = ssmPathFor(original);
    const parsed = parseSsmPath(PREFIX, full);
    expect(parsed).toEqual({ app: original.app, profile: original.profile, key: original.key });
  });
});

describe('dotenvFileName', () => {
  it('maps _default to .env', () => {
    expect(dotenvFileName(DEFAULT_PROFILE)).toBe('.env');
  });

  it('uses .env.<profile> otherwise', () => {
    expect(dotenvFileName('development')).toBe('.env.development');
    expect(dotenvFileName('px')).toBe('.env.px');
  });
});

describe('dotenvFilePath', () => {
  it('joins repoRoot/appPath/.env.<profile>', () => {
    expect(dotenvFilePath({ repoRoot: '/repo', appPath: 'apps/api', profile: 'production' })).toBe(
      path.join('/repo', 'apps/api', '.env.production'),
    );
  });

  it('_default maps to .env', () => {
    expect(dotenvFilePath({ repoRoot: '/repo', appPath: 'apps/web/infra', profile: DEFAULT_PROFILE })).toBe(
      path.join('/repo', 'apps/web/infra', '.env'),
    );
  });
});
