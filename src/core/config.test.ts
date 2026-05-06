import { describe, expect, it } from 'vitest';

import { defineConfig, type ParleyConfig, ParleyConfigSchema, resolveApp, resolveAppProfile } from './config.ts';
import { UnknownAppError, UnknownProfileError } from './errors.ts';

const validConfig: ParleyConfig = {
  region: 'ap-northeast-2',
  prefix: '/myorg/myproject',
  kmsKeyId: 'alias/parley',
  apps: {
    api: { path: 'apps/api', profiles: ['development', 'production'] },
    'web-edge': { path: 'apps/web/platform', profiles: ['_default'] },
  },
};

describe('ParleyConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(ParleyConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  it('rejects empty apps', () => {
    expect(() => ParleyConfigSchema.parse({ ...validConfig, apps: {} })).toThrow();
  });

  it('rejects invalid prefix', () => {
    expect(() => ParleyConfigSchema.parse({ ...validConfig, prefix: 'no-slash' })).toThrow();
    expect(() => ParleyConfigSchema.parse({ ...validConfig, prefix: '/trailing/' })).toThrow();
  });

  it('rejects invalid app names', () => {
    expect(() =>
      ParleyConfigSchema.parse({ ...validConfig, apps: { Service: { path: 'apps/web', profiles: ['development'] } } }),
    ).toThrow();
  });

  it('rejects empty profiles', () => {
    expect(() =>
      ParleyConfigSchema.parse({ ...validConfig, apps: { api: { path: 'apps/api', profiles: [] } } }),
    ).toThrow();
  });
});

describe('defineConfig', () => {
  it('returns valid input as-is', () => {
    expect(defineConfig(validConfig)).toEqual(validConfig);
  });
});

describe('resolveApp', () => {
  it('finds a defined app', () => {
    expect(resolveApp(validConfig, 'api').name).toBe('api');
  });

  it('exposes candidates on UnknownAppError', () => {
    try {
      resolveApp(validConfig, 'nope');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownAppError);
      expect((err as UnknownAppError).available).toEqual(['api', 'web-edge']);
      expect((err as Error).message).toContain('api');
      expect((err as Error).message).toContain('web-edge');
    }
  });
});

describe('resolveAppProfile', () => {
  it('returns when both app and profile match', () => {
    const r = resolveAppProfile(validConfig, 'api', 'production');
    expect(r.app.name).toBe('api');
    expect(r.profile).toBe('production');
  });

  it('exposes candidates on UnknownProfileError', () => {
    try {
      resolveAppProfile(validConfig, 'api', 'staging');
      expect.fail('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(UnknownProfileError);
      expect((err as UnknownProfileError).available).toEqual(['development', 'production']);
      expect((err as Error).message).toContain('development');
    }
  });
});
