/**
 * ComfyCloudRuntime.ts — Cloud dispatch engine for image/audio/video generation
 * via the Comfy Cloud API (cloud.comfy.org).
 *
 * Comfy Cloud is a first-party managed cloud runtime that serves as a headless
 * replacement for local ComfyUI. It consumes the same node graph payloads
 * (txt2img.json, txt2audio.json, txt2video.json), posts them to
 * cloud.comfy.org/api/prompt, and polls for execution completion.
 *
 * This runtime handles:
 *   - API key retrieval from VS Code SecretStorage
 *   - Workflow submission to cloud.comfy.org/api/prompt
 *   - Polling /api/history/{promptId} for completion
 *   - Returning output file URLs
 */
import * as vscode from "vscode"

export interface ComfyCloudRequest {
	/** Full ComfyUI workflow JSON (txt2img, txt2audio, etc.) */
	workflow: any
	/** Maximum time (seconds) to wait for execution (default: 300) */
	timeout?: number
}

export interface ComfyCloudResult {
	success: boolean
	/** Array of output file URLs */
	outputs?: string[]
	error?: string
}

const SECRET_KEY = "mirror_comfy_cloud_api_token"
const DEFAULT_BASE_URL = "https://cloud.comfy.org"

export class ComfyCloudRuntime {
	/**
	 * Execute a generation request via the Comfy Cloud API.
	 *
	 * @param context - VS Code ExtensionContext (for SecretStorage access)
	 * @param request - Workflow payload and optional timeout
	 */
	static async executeGeneration(
		context: vscode.ExtensionContext,
		request: ComfyCloudRequest,
	): Promise<ComfyCloudResult> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { success: false, error: "Comfy Cloud API key is not configured. Set it in Extension Settings." }
			}

			const timeout = request.timeout ?? 300

			// Step 1: Submit workflow
			const promptResponse = await fetch(`${DEFAULT_BASE_URL}/api/prompt`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					prompt: request.workflow,
				}),
			})

			if (!promptResponse.ok) {
				const errBody = await promptResponse.text()
				return {
					success: false,
					error: `Comfy Cloud prompt submission failed: ${promptResponse.status} ${promptResponse.statusText} — ${errBody}`,
				}
			}

			const promptData = await promptResponse.json()
			const promptId = promptData.prompt_id
			if (!promptId) {
				return { success: false, error: "Comfy Cloud did not return a prompt_id." }
			}

			// Step 2: Poll for completion
			const result = await this.pollForResult(apiKey, promptId, timeout)
			return result
		} catch (e: any) {
			return { success: false, error: e.message || "Unknown Comfy Cloud execution error." }
		}
	}

	/**
	 * Validate that the Comfy Cloud API token is configured and reachable.
	 */
	static async validateConfiguration(
		context: vscode.ExtensionContext,
	): Promise<{ valid: boolean; message?: string }> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { valid: false, message: "Comfy Cloud API key is not configured." }
			}

			// Lightweight health check by hitting the history endpoint
			const response = await fetch(`${DEFAULT_BASE_URL}/api/history`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			})

			if (!response.ok) {
				return { valid: false, message: `Comfy Cloud API returned HTTP ${response.status}` }
			}

			return { valid: true }
		} catch (e: any) {
			return { valid: false, message: e.message || "Could not reach Comfy Cloud API." }
		}
	}

	/**
	 * Retrieve the API key from VS Code's encrypted SecretStorage.
	 */
	private static async getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
		return context.secrets.get(SECRET_KEY)
	}

	/**
	 * Poll /api/history/{promptId} until the workflow completes or times out.
	 */
	private static async pollForResult(
		apiKey: string,
		promptId: string,
		timeoutSeconds: number,
	): Promise<ComfyCloudResult> {
		const startTime = Date.now()
		const pollIntervalMs = 2000
		const maxAttempts = Math.ceil((timeoutSeconds * 1000) / pollIntervalMs)

		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))

			const elapsed = (Date.now() - startTime) / 1000

			try {
				const response = await fetch(`${DEFAULT_BASE_URL}/api/history/${promptId}`, {
					headers: { Authorization: `Bearer ${apiKey}` },
				})

				if (!response.ok) {
					if (response.status === 404) {
						// Workflow still queued or running — keep polling
						continue
					}
					const errBody = await response.text()
					return {
						success: false,
						error: `Comfy Cloud history fetch failed (${response.status}): ${errBody}`,
					}
				}

				const historyData = await response.json()

				// Comfy Cloud returns history keyed by prompt_id
				const entry = historyData[promptId] || historyData
				if (!entry || entry.status?.completed === undefined) {
					// Not yet complete
					continue
				}

				if (entry.status?.completed === false || entry.status?.failed) {
					return {
						success: false,
						error: entry.status?.error_message || "Comfy Cloud execution failed.",
					}
				}

				// Success — extract output URLs
				const outputs: string[] = []
				if (entry.outputs) {
					for (const nodeId of Object.keys(entry.outputs)) {
						const nodeOutput = entry.outputs[nodeId]
						for (const key of Object.keys(nodeOutput)) {
							const images = nodeOutput[key]
							if (Array.isArray(images)) {
								for (const img of images) {
									if (img.filename && img.type) {
										outputs.push(
											`${DEFAULT_BASE_URL}/api/view?filename=${encodeURIComponent(img.filename)}&type=${encodeURIComponent(img.type)}&subfolder=${encodeURIComponent(img.subfolder || "")}`,
										)
									}
								}
							} else if (typeof images === "object" && images?.filename) {
								// Single output (audio/video file)
								outputs.push(
									`${DEFAULT_BASE_URL}/api/view?filename=${encodeURIComponent(images.filename)}&type=${encodeURIComponent(images.type || "output")}&subfolder=${encodeURIComponent(images.subfolder || "")}`,
								)
							}
						}
					}
				}

				if (outputs.length === 0) {
					return { success: false, error: "Comfy Cloud returned no output files." }
				}

				return { success: true, outputs }
			} catch {
				// Temporary network error — keep polling
				continue
			}
		}

		return {
			success: false,
			error: `Comfy Cloud execution timed out after ${timeoutSeconds}s.`,
		}
	}
}
