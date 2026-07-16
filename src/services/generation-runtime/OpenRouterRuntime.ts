/**
 * OpenRouterRuntime.ts — Cloud dispatch engine for non-image generation
 * via OpenRouter's chat completions API.
 *
 * This decoupled runtime translates generation payloads into targeted
 * OpenRouter structural completions, abstracting model parameters
 * uniformly away from the main agent control-loop orchestration logic.
 *
 * NOTE: OpenRouter is primarily a chat completions API. Audio/video
 * generation uses structured prompting which may not produce native
 * files. This runtime serves as a cloud fallback when local ComfyUI
 * is unavailable or unsuitable.
 */
import * as vscode from "vscode"

export interface GenerationRequest {
	type: "image" | "audio" | "video"
	workflowType: string
	prompt: string
	negativePrompt?: string
	aspectRatio?: string
	duration?: number
}

export interface GenerationResult {
	success: boolean
	url?: string
	error?: string
}

const SECRET_KEY = "mirror_openrouter_api_token"
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

export class OpenRouterRuntime {
	/**
	 * Execute a generation request via OpenRouter's chat completions API.
	 *
	 * @param context - VS Code ExtensionContext (for SecretStorage access)
	 * @param modelSlug - OpenRouter model identifier (e.g. "stabilityai/stable-diffusion-3")
	 * @param request - Structured generation request payload
	 */
	static async executeGeneration(
		context: vscode.ExtensionContext,
		modelSlug: string,
		request: GenerationRequest,
	): Promise<GenerationResult> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { success: false, error: "OpenRouter API key is not configured. Set it in Extension Settings." }
			}

			const response = await fetch(`${DEFAULT_BASE_URL}/v1/chat/completions`, {
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
					error: `OpenRouter execution failed: ${response.status} ${response.statusText} — ${errBody}`,
				}
			}

			const data = await response.json()
			const content = data.choices?.[0]?.message?.content
			if (!content) {
				return { success: false, error: "OpenRouter returned an empty response." }
			}

			const result = JSON.parse(content)
			return {
				success: true,
				url: result.output_url || result.url || result.file_path,
			}
		} catch (e: any) {
			return { success: false, error: e.message || "Unknown OpenRouter execution error." }
		}
	}

	/**
	 * Validate that the OpenRouter API token is configured and reachable.
	 */
	static async validateConfiguration(
		context: vscode.ExtensionContext,
	): Promise<{ valid: boolean; message?: string }> {
		try {
			const apiKey = await this.getApiKey(context)
			if (!apiKey) {
				return { valid: false, message: "OpenRouter API key is not configured." }
			}

			const response = await fetch(`${DEFAULT_BASE_URL}/v1/models`, {
				headers: { Authorization: `Bearer ${apiKey}` },
			})

			if (!response.ok) {
				return { valid: false, message: `OpenRouter API returned HTTP ${response.status}` }
			}

			return { valid: true }
		} catch (e: any) {
			return { valid: false, message: e.message || "Could not reach OpenRouter API." }
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
	private static formatPayload(req: GenerationRequest): string {
		return JSON.stringify({
			task: `Generate ${req.type} asset from prompt description.`,
			prompt: req.prompt,
			negative_prompt: req.negativePrompt || "",
			parameters: {
				type: req.workflowType,
				aspect_ratio: req.aspectRatio || "1:1",
				duration_seconds: req.duration || 10.0,
			},
		})
	}
}
