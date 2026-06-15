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

// Concatenate sidebar parts into a single sidebar.js
function concatSidebarParts() {
  const partsDir = path.join(__dirname, 'src', 'webview', 'sidebar');
  const parts = ['01-core.js', '02-ui-renderers.js', '03-submit-send.js', '04-tool-cards.js', '05-message-handlers.js', '06-markdown.js', '07-sessions-diffs.js', '08-artifacts.js', '09-dashboard.js', '10-providers-mcp-modes.js'];
  let combined = '';
  for (const part of parts) {
    const partPath = path.join(partsDir, part);
    if (fs.existsSync(partPath)) {
      combined += fs.readFileSync(partPath, 'utf-8') + '\n';
    } else {
      console.warn(`Warning: sidebar part not found: ${part}`);
    }
  }
  // Write the concatenated file to src/webview/sidebar.js
  const outputPath = path.join(__dirname, 'src', 'webview', 'sidebar.js');
  fs.writeFileSync(outputPath, combined, 'utf-8');
  console.log('Sidebar parts concatenated into sidebar.js');
}

// Copy webview assets to dist
function copyWebviewAssets() {
  // First concatenate sidebar parts
  concatSidebarParts();
  
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
