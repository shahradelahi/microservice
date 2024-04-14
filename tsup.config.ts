import { defineConfig } from 'tsup';

export default defineConfig([
  {
    clean: true,
    dts: true,
    entry: ['src/lib.ts'],
    format: ['cjs', 'esm'],
    target: 'esnext',
    outDir: 'dist'
  },
  {
    entry: ['src/cli.ts'],
    minify: true,
    format: ['esm'],
    target: 'esnext',
    outDir: 'dist'
  }
]);
