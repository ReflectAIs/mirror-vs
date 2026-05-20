const esbuild = require("esbuild");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: isMinify,
    sourcemap: !isMinify,
    platform: "node",
    target: "node18",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "info",
  });

  if (isWatch) {
    console.log("Starting esbuild watch mode...");
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log("Extension build completed successfully.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
