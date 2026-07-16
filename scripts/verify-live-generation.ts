/**
 * Full end-to-end verification: loads the second_flow pipeline, normalizes it
 * with the fixed WIDGET_INPUT_ORDER, and sends it to ComfyUI's /prompt API.
 *
 * Run: npx tsx scripts/verify-live-generation.ts
 */
import * as fs from "fs"
import * as path from "path"

async function main() {
	// Load the actual flash pipeline
	const workflowPath = path.resolve(__dirname, "../src/services/image-runtime/workflows/txt2img-flash.json")
	const raw = JSON.parse(fs.readFileSync(workflowPath, "utf-8"))
	const { _pipeline, ...workflow } = raw

	const { WorkflowEngine } = await import("../src/services/image-runtime/workflows/engine")

	// Run normalization (includes convertLegacyToObject + populateWidgetInputs)
	const normalized = WorkflowEngine.normalizeWorkflow(workflow)

	// Inject prompt, seed, etc like ComfyUIProvider.generate() does
	WorkflowEngine.injectPrompt(normalized, "cute dog, high quality, detailed")
	WorkflowEngine.injectSeed(normalized, Math.floor(Math.random() * 1000000))

	// Validate SamplerCustom node has required inputs
	let samplerNode: any = null
	let samplerId = ""
	for (const [id, n] of Object.entries(normalized)) {
		if ((n as any).class_type === "SamplerCustom") {
			samplerNode = n as any
			samplerId = id
			break
		}
	}

	console.log("\n🔍 SamplerCustom node inputs (AFTER normalization + injection):")
	console.log(`   add_noise: ${samplerNode.inputs.add_noise}`)
	console.log(`   noise_seed: ${samplerNode.inputs.noise_seed}`)
	console.log(`   cfg: ${samplerNode.inputs.cfg}`)
	console.log(`   widgets_values: ${samplerNode.widgets_values}`)

	const requiredInputs = ["model", "positive", "negative", "latent_image", "add_noise", "noise_seed", "cfg"]
	const missing = requiredInputs.filter((k) => samplerNode.inputs[k] === undefined)

	if (missing.length > 0) {
		console.error(`\n❌ MISSING REQUIRED INPUTS: ${missing.join(", ")}`)
		process.exit(1)
	}
	console.log("\n✅ All required inputs present in SamplerCustom node")

	// Build the full prompt payload
	const prompt = {
		prompt: normalized,
		client_id: `test-${Date.now()}`,
	}

	console.log("\n🚀 Sending to ComfyUI /prompt API...")
	const response = await fetch("http://127.0.0.1:8188/prompt", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(prompt),
	})

	const result = await response.json()
	console.log(`\n📡 Response status: ${response.status}`)

	if (response.ok && result.prompt_id) {
		const promptId = result.prompt_id
		console.log(`✅ PROMPT ACCEPTED! prompt_id: ${promptId}`)

		// Poll for result
		console.log("\n⏳ Waiting for generation to complete...")
		let attempts = 0
		const maxAttempts = 120 // 2 minutes
		while (attempts < maxAttempts) {
			await new Promise((r) => setTimeout(r, 1000))
			const histResponse = await fetch(`http://127.0.0.1:8188/history/${promptId}`)
			if (histResponse.ok) {
				const hist = await histResponse.json()
				if (hist[promptId]?.status?.completed) {
					console.log(`\n✅ GENERATION COMPLETED!`)
					const outputs = hist[promptId].outputs
					console.log(`   Outputs:`, Object.keys(outputs))

					// Save the first image
					for (const [nodeId, nodeOutputs] of Object.entries(outputs)) {
						const images = (nodeOutputs as any).images
						if (images && images.length > 0) {
							const img = images[0]
							const imgResponse = await fetch(
								`http://127.0.0.1:8188/view?filename=${img.filename}&subfolder=${img.subfolder}&type=${img.type}`,
							)
							const imgBuffer = Buffer.from(await imgResponse.arrayBuffer())
							const outputPath = path.resolve(__dirname, "../test-output-dog.png")
							fs.writeFileSync(outputPath, imgBuffer)
							console.log(`   💾 Image saved to: ${outputPath}`)
							break
						}
					}
					break
				}
			}
			attempts++
		}

		if (attempts >= maxAttempts) {
			console.log("\n⚠️ Timed out waiting for generation")
			process.exit(1)
		}
	} else {
		console.error(`\n❌ PROMPT REJECTED!`)
		if (result.error) {
			console.error(`   Error: ${result.error}`)
		}
		if (result.node_errors) {
			for (const [nodeId, errors] of Object.entries(result.node_errors)) {
				console.error(`   Node ${nodeId}:`, JSON.stringify(errors))
			}
		}
		// Show full response for debugging
		console.log("   Full response:", JSON.stringify(result, null, 2))
		process.exit(1)
	}

	console.log("\n🎉 FULL END-TO-END TEST PASSED!")
}

main().catch((err) => {
	console.error("Script failed:", err)
	process.exit(1)
})
