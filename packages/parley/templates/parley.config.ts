import { defineConfig } from '@coldsurf/parley/config';

export default defineConfig({
  region: 'ap-northeast-2',
  prefix: '/myorg/myproject',
  kmsKeyId: 'alias/parley',
  apps: {
    api: { path: 'apps/api', profiles: ['development', 'staging', 'production'] },
    web: { path: 'apps/web', profiles: ['development', 'production'] },
  },
});
