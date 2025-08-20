import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'server/index': 'server/index.ts',
  },
  sourcemap: true,
  clean: true,
  target: 'node20',
  format: ['cjs'],
});
