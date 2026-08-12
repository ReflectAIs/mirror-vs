import { defineConfig } from "tsup"

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	clean: true,
	sourcemap: true,
	target: "node20",
	platform: "node",
	banner: {
		js: "#!/usr/bin/env node",
	},
	// Bundle workspace packages that export TypeScript
	noExternal: ["@mirror-vs/core", "@mirror-vs/core/cli", "@mirror-vs/types", "@mirror-vs/vscode-shim"],
	external: [
		// Keep native modules external
		"@anthropic-ai/sdk",
		"@anthropic-ai/bedrock-sdk",
		"@anthropic-ai/vertex-sdk",
		// Keep @vscode/ripgrep external - we bundle the binary separately
		"@vscode/ripgrep",
		// Optional dev dependency of ink - not needed at runtime
		"react-devtools-core",
	],
	esbuildOptions(options) {
		// Enable JSX for React/Ink components
		options.jsx = "automatic"
		options.jsxImportSource = "react"
	},
	async onSuccess() {
		const fs = await import("fs")
		const path = await import("path")
		const srcDist = path.resolve(__dirname, "../../src/dist")
		const cliExt = path.resolve(__dirname, "extension")
		if (fs.existsSync(path.join(srcDist, "extension.js"))) {
			fs.mkdirSync(cliExt, { recursive: true })
			fs.cpSync(srcDist, cliExt, { recursive: true })
			fs.writeFileSync(path.join(cliExt, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2))
			console.log("[tsup] Copied extension bundle & package.json (commonjs) to apps/cli/extension")
		}
	},
})
