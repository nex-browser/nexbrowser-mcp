import { defineConfig } from 'tsup';

/** Bundles ESM, CommonJS, and one root declaration file per module format. */
export default defineConfig({
  entry: { index: 'src/index.ts', cli: 'src/cli.ts' },
  format: ['cjs', 'esm'],
  outDir: 'lib',
  outExtension({ format }) {
    return format === 'cjs' ? { js: '.cjs' } : { js: '.js' };
  },
  dts: true,
  sourcemap: false,
  clean: true,
  target: 'node18',
  splitting: false,
  treeshake: true
});
