import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const baseOptions = {
  bundle: true,
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  logLevel: 'info',
};

// Main extension bundle
const extensionBuild = esbuild.context({
  ...baseOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'out/extension.js',
});

// Test runner bundle (separate entry point)
const testRunnerBuild = esbuild.context({
  ...baseOptions,
  entryPoints: ['src/test/runTest.ts'],
  outfile: 'out/test/runTest.js',
});

// Test suite bundle
const testSuiteBuild = esbuild.context({
  ...baseOptions,
  entryPoints: [
    'src/test/suite/index.ts',
    'src/test/suite/decorationManager.test.ts',
    'src/test/suite/focusMode.test.ts',
  ],
  outdir: 'out/test/suite',
});

async function main() {
  const [ext, runner, suite] = await Promise.all([
    extensionBuild,
    testRunnerBuild,
    testSuiteBuild,
  ]);

  if (isWatch) {
    console.log('[esbuild] Watching for changes...');
    await Promise.all([ext.watch(), runner.watch(), suite.watch()]);
  } else {
    await Promise.all([ext.rebuild(), runner.rebuild(), suite.rebuild()]);
    await Promise.all([ext.dispose(), runner.dispose(), suite.dispose()]);
    console.log('[esbuild] Build complete.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
