
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isMinify = process.argv.includes('--minify');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    minify: isMinify,
    sourcemap: !isMinify,
    platform: 'node',
    target: 'node18',
    external: ['vscode', 'puppeteer-core'],
    format: 'cjs',
    outfile: 'dist/extension.js',
  });

  if (isWatch) {
    console.log('[esbuild] Watching for changes...');
    await ctx.watch();
  } else {
    await ctx.rebuild();
    console.log('[esbuild] Build complete: dist/extension.js');
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
