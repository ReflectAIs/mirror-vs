const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isMinify = args.includes('--minify');

// Ensure the dist/webview directory exists
const webviewDistDir = path.join(__dirname, 'dist', 'webview');
if (!fs.existsSync(webviewDistDir)) {
  fs.mkdirSync(webviewDistDir, { recursive: true });
}

// Copy webview assets to dist
function copyWebviewAssets() {
  const webviewSrcDir = path.join(__dirname, 'src', 'webview');
  const filesToCopy = ['sidebar.html', 'sidebar.js', 'sidebar.css', 'syntax-highlighter.js'];
  for (const file of filesToCopy) {
    const src = path.join(webviewSrcDir, file);
    const dest = path.join(webviewDistDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }
  console.log('Webview assets copied to dist/webview/');
}

async function main() {
  // Copy webview assets first
  copyWebviewAssets();

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
