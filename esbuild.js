const esbuild = require('esbuild');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isMinify = args.includes('--minify');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outdir: 'dist',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node16',
    minify: isMinify,
    sourcemap: true,
  });

  if (isWatch) {
    console.log('Watching for changes...');
    await ctx.watch();
  } else {
    console.log('Building...');
    await ctx.rebuild();
    await ctx.dispose();
    console.log('Build completed!');
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
