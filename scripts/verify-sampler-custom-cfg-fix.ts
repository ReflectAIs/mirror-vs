/**
 * Verification script for the SamplerCustom `cfg` fix.
 *
 * Loads the txt2img-flash.json workflow (the `second_flow` pipeline),
 * runs normalizeWorkflow() on it, and verifies that:
 *   - SamplerCustom node's `inputs.cfg` is populated from widgets_values[3]
 *   - All required inputs (add_noise, noise_seed, cfg) are present
 *   - widgets_values is stripped after normalization
 *
 * Run: npx tsx scripts/verify-sampler-custom-cfg-fix.ts
 */

import * as fs from "fs"
import * as path from "path"

// Load the actual flash pipeline
const workflowPath = path.resolve(__dirname, "../src/services/image-runtime/workflows/txt2img-flash.json")
const raw = JSON.parse(fs.readFileSync(workflowPath, "utf-8"))

// Remove the _pipeline header to get the pure workflow payload
const { _pipeline, ...workflow } = raw

// Import WorkflowEngine
import { WorkflowEngine } from "../src/services/image-runtime/workflows/engine"

// Run normalization
const normalized = WorkflowEngine.normalizeWorkflow(workflow)

// Find SamplerCustom node
let samplerCustomNode: any = null
let samplerCustomId: string | null = null

for (const [nodeId, node] of Object.entries(normalized)) {
	if ((node as any).class_type === "SamplerCustom") {
		samplerCustomNode = node as any
		samplerCustomId = nodeId
		break
	}
}

if (!samplerCustomNode) {
	console.error("❌ FAIL: Could not find SamplerCustom node in normalized workflow")
	process.exit(1)
}

console.log(`\n🔍 SamplerCustom node (id=${samplerCustomId}):`)
console.log("   inputs:", JSON.stringify(samplerCustomNode.inputs, null, 2))

// Check required inputs
const checks = [
	{ name: "inputs.add_noise", value: samplerCustomNode.inputs.add_noise, expected: true },
	{ name: "inputs.noise_seed", value: samplerCustomNode.inputs.noise_seed, expected: 0 },
	{ name: "inputs.cfg", value: samplerCustomNode.inputs.cfg, expected: 1 },
	{ name: "widgets_values stripped", value: samplerCustomNode.widgets_values, expected: undefined },
]

let allPassed = true
console.log("\n📋 Verification checks:")

for (const check of checks) {
	const passed = check.value === check.expected
	const status = passed ? "✅ PASS" : "❌ FAIL"
	console.log(
		`   ${status}: ${check.name} = ${JSON.stringify(check.value)}${passed ? "" : ` (expected ${JSON.stringify(check.expected)})`}`,
	)
	if (!passed) allPassed = false
}

// Verify all connection inputs are preserved
const requiredConnections = ["model", "positive", "negative", "sampler", "sigmas", "latent_image"]
console.log("\n🔗 Connection input verification:")
for (const conn of requiredConnections) {
	const val = samplerCustomNode.inputs[conn]
	const isTuple = Array.isArray(val) && val.length === 2 && typeof val[0] === "string" && typeof val[1] === "number"
	const status = isTuple ? "✅ PASS" : "❌ FAIL"
	console.log(`   ${status}: inputs.${conn} = ${JSON.stringify(val)}`)
	if (!isTuple) allPassed = false
}

console.log("")
if (allPassed) {
	console.log("🎉 ALL CHECKS PASSED — SamplerCustom `cfg` fix is verified!")
} else {
	console.log("💥 SOME CHECKS FAILED — Review the output above.")
	process.exit(1)
}
