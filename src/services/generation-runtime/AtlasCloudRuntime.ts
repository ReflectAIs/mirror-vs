/**
 * AtlasCloudRuntime.ts — Simplified cloud dispatch engine for multi-modal
 * generation via the Atlas Cloud API (OpenAI-compatible aggregator).
 *
 * Atlas Cloud provides a drop-in enterprise endpoint for accessing various
 * generation models (e.g. Wan 2.7, Seedance 2.0, Kling 3) without requiring
 * direct node graph injection. It follows an OpenAI-compatible chat completions
 * API pattern, similar to OpenRouter.
 *
 * This runtime handles:
 *   - API key retrieval from VS Code SecretStorage
 *   - OpenAI-compatible request formatting
 *   - Response parsing and URL extraction
 */
import * as vscode from "vscode"

export interface AtlasCloudRequest {
	type: "image" | "audio" | "video"
	prompt: string
	model?: string
	negativePrompt?: string
	aspectRatio?: string
	duration?: number
}

export interface AtlasCloudResult {
	success: boolean
	url?: string
	error?: string
}

const SECRET_KEY = "mirror_atlas_cloud_api_token"
const DEFAULT_BASE_URL = "https://api.atlas.cloud/v1"

export class AtlasCloudRuntime {
	/**
	 * Execute a generation request via Atlas Cloud's OpenAI-compatible API.
	 *
	 * @param context - VS Code ExtensionContext (for SecretStorage access)
	 * @param modelSlug - Atlas Cloud model identifier (e.g. "wan-2.7")
	 * @param request - Structured generation request payload
	 */
	static async executeGeneration(
		context: vscode.ExtensionContext,
		modelSlug: string,
		request: AtlasCloudRequest,
	): Promise<AtlasCloudResult> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { success: false, error: "Atlas Cloud API key is not configured. Set it in Extension Settings." }
			}

			const response = await fetch(`${DEFAULT_BASE_URL}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://github.com/mirror-vs/extension",
					"X-Title": "Mirror VS Code Extension",
				},
				body: JSON.stringify({
					model: modelSlug,
					messages: [
						{
							role: "user",
							content: this.formatPayload(request),
						},
					],
					response_format: { type: "json_object" },
				}),
			})

			if (!response.ok) {
				const errBody = await response.text()
				return {
					success: false,
					error: `Atlas Cloud execution failed: ${response.status} ${response.statusText} — ${errBody}`,
				}
			}

			const data = await response.json()
			const content = data.choices?.[0]?.message?.content
			if (!content) {
				return { success: false, error: "Atlas Cloud returned an empty response." }
			}

			const result = JSON.parse(content)
			return {
				success: true,
				url: result.output_url || result.url || result.file_path,
			}
		} catch (e: any) {
			return { success: false, error: e.message || "Unknown Atlas Cloud execution error." }
		}
	}

	/**
	 * Validate that the Atlas Cloud API token is configured and reachable.
	 */
	static async validateConfiguration(
		context: vscode.ExtensionContext,
	): Promise<{ valid: boolean; message?: string }> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { valid: false, message: "Atlas Cloud API key is not configured." }
			}

			const response = await fetch(`${DEFAULT_BASE_URL}/models`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			})

			if (!response.ok) {
				return { valid: false, message: `Atlas Cloud API returned HTTP ${response.status}` }
			}

			return { valid: true }
		} catch (e: any) {
			return { valid: false, message: e.message || "Could not reach Atlas Cloud API." }
		}
	}

	/**
	 * Retrieve the API key from VS Code's encrypted SecretStorage.
	 */
	private static async getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
		return context.secrets.get(SECRET_KEY)
	}

	/**
	 * Format a generation request into a structured prompt for the model.
	 */
	private static formatPayload(req: AtlasCloudRequest): string {
		return JSON.stringify({
			task: `Generate ${req.type} asset from prompt description.`,
			prompt: req.prompt,
			negative_prompt: req.negativePrompt || "",
			parameters: {
				aspect_ratio: req.aspectRatio || "1:1",
				duration_seconds: req.duration || 10.0,
			},
		})
	}
}
