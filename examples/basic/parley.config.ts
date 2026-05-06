import { defineConfig } from '@coldsurf/parley/config';

export default defineConfig({
  region: 'ap-northeast-2',
  prefix: '/parley-examples/basic',
  kmsKeyId: 'alias/parley',
  apps: { api: { path: '.', profiles: ['development', 'production'] } },
});
