import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'src/cli.ts', config: 'src/core/config.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  shims: false,
  banner: ({ format }) => {
    if (format === 'esm') {
      return { js: '#!/usr/bin/env node' };
    }
    return {};
  },
});
