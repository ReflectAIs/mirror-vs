/**
 * Structured error types for ComfyUI image generation.
 *
 * Transforms raw ComfyUI error strings into categorized, machine-readable
 * errors so the LLM model can understand what went wrong and what to do
 * about it.
 */

// ─── Error categories ──────────────────────────────────────────────

export type ComfyUIErrorCategory =
	| "workflow_validation" // Missing required inputs, wrong node format
	| "execution_error" // Node crashed during execution (OOM, NaN, etc.)
	| "model_error" // Model not found, incompatible, failed to load
	| "network_error" // Server unreachable, connection reset, timeout
	| "queue_error" // Queue full, prompt rejected
	| "output_error" // Image fetch failed, missing output
	| "unknown" // Fallback

// ─── Error codes ───────────────────────────────────────────────────

export const ComfyUIErrorCode = {
	MISSING_INPUT: "MISSING_INPUT",
	NODE_ERROR: "NODE_ERROR",
	MODEL_NOT_FOUND: "MODEL_NOT_FOUND",
	MODEL_LOAD_FAILED: "MODEL_LOAD_FAILED",
	CONNECTION_FAILED: "CONNECTION_FAILED",
	HTTP_ERROR: "HTTP_ERROR",
	TIMEOUT: "TIMEOUT",
	QUEUE_FULL: "QUEUE_FULL",
	EXECUTION_FAILED: "EXECUTION_FAILED",
	OUTPUT_NOT_FOUND: "OUTPUT_NOT_FOUND",
	WORKFLOW_INVALID: "WORKFLOW_INVALID",
	UNKNOWN: "UNKNOWN",
} as const

export type ComfyUIErrorCode = (typeof ComfyUIErrorCode)[keyof typeof ComfyUIErrorCode]

// ─── Structured error details ──────────────────────────────────────

export interface ComfyUIErrorDetails {
	category: ComfyUIErrorCategory
	code: ComfyUIErrorCode
	/** Human-readable message (includes context about what happened) */
	message: string
	/** Which node caused the error (ComfyUI node ID, if known) */
	nodeId?: string
	/** Human-readable title of the node (e.g. "Save Image", "KSampler") */
	nodeTitle?: string
	/** ComfyUI class_type of the node (e.g. "SaveImage", "KSamplerAdvanced") */
	nodeClassType?: string
	/** Actionable advice for the LLM on how to fix or respond */
	suggestion?: string
	/** The raw error text from ComfyUI, preserved for debugging */
	rawError?: string
}

// ─── ComfyUIError class ────────────────────────────────────────────

export class ComfyUIError extends Error {
	public readonly details: ComfyUIErrorDetails

	constructor(details: ComfyUIErrorDetails) {
		super(details.message)
		this.name = "ComfyUIError"
		this.details = details
	}
}

// ─── Error patterns & parser ───────────────────────────────────────

interface ErrorPattern {
	test: RegExp
	category: ComfyUIErrorCategory
	code: ComfyUIErrorCode
	/** Optional extractor for node information from the match groups */
	extractNode?: (m: RegExpExecArray) => { nodeId?: string; nodeTitle?: string; nodeClassType?: string }
	/** Template for suggestion; {0} = nodeTitle, {1} = nodeClassType, {2} = raw matched text */
	suggestionTemplate: string
}

const ERROR_PATTERNS: ErrorPattern[] = [
	{
		// "Required input is missing: filename_prefix"
		// "Required input is missing: images"
		test: /Required input is missing:\s*(\S+)/i,
		category: "workflow_validation",
		code: ComfyUIErrorCode.MISSING_INPUT,
		suggestionTemplate:
			"The {0} node is missing a required input '{2}'. This is likely a workflow format issue — " +
			"a legacy widget value wasn't converted to the expected input field. " +
			"Try using a different pipeline variant or check the workflow definition.",
	},
	{
		// "Node X crashed: ..."
		test: /Node\s+#?(\d+)\s+(crashed|failed|error):?\s*(.*)/i,
		category: "execution_error",
		code: ComfyUIErrorCode.NODE_ERROR,
		extractNode: (m) => ({ nodeId: m[1], nodeClassType: m[3] }),
		suggestionTemplate:
			"Node {0} crashed during execution. This may be due to an OOM, NaN values, or an incompatible " +
			"model/node combination. Try reducing the resolution, using a simpler pipeline, or checking " +
			"the ComfyUI console for detailed error logs.",
	},
	{
		// "Model not found: ..."
		// "Checkpoint loader: model not found"
		test: /model\s+not\s+found/i,
		category: "model_error",
		code: ComfyUIErrorCode.MODEL_NOT_FOUND,
		suggestionTemplate:
			"The requested model is not installed in ComfyUI. Try using a different model name or " +
			"ask the user to download the required model first.",
	},
	{
		// "Failed to load model: ..."
		test: /(?:failed|unable)\s+to\s+load\s+model/i,
		category: "model_error",
		code: ComfyUIErrorCode.MODEL_LOAD_FAILED,
		suggestionTemplate:
			"The model failed to load. It may be corrupted or incompatible with the current ComfyUI version. " +
			"Try a different model.",
	},
	{
		// "Cannot connect to server / connection refused"
		test: /(?:cannot\s+connect|connection\s+refused|ECONNREFUSED|econnrefused)/i,
		category: "network_error",
		code: ComfyUIErrorCode.CONNECTION_FAILED,
		suggestionTemplate:
			"Cannot connect to the ComfyUI server. Ensure ComfyUI is running and the server URL is correct. " +
			"Ask the user to start ComfyUI and try again.",
	},
	{
		// "Queue full"
		test: /queue\s+full/i,
		category: "queue_error",
		code: ComfyUIErrorCode.QUEUE_FULL,
		suggestionTemplate: "The ComfyUI queue is full. Wait for current jobs to finish before retrying.",
	},
	{
		// "prompt_outputs_failed_validation" — ComfyUI rejects the prompt because the
		// output nodes (SaveImage, SaveAudio, etc.) do not match what the API workflow
		// format expects. This happens when the workflow payload structure is incompatible
		// with the ComfyUI version or the node connections are invalid.
		test: /prompt_outputs_failed_validation/i,
		category: "workflow_validation",
		code: ComfyUIErrorCode.WORKFLOW_INVALID,
		suggestionTemplate:
			"ComfyUI rejected the prompt because the output nodes failed validation. " +
			"This is typically caused by an incompatible workflow format — the pipeline may use " +
			"nodes that are not installed, or the node connections may be invalid after conversion. " +
			"Try using a different pipeline variant (e.g. txt2img instead of txt2img-flash) or " +
			"check the ComfyUI console for detailed error information.",
	},
	{
		// Generic timeout — no result received within polling budget
		test: /no result received/i,
		category: "unknown",
		code: ComfyUIErrorCode.TIMEOUT,
		suggestionTemplate:
			"ComfyUI did not return a result within the timeout period (4 minutes). " +
			"The workflow may be stuck on a long-running node or the server may be overloaded.",
	},
]

/**
 * Parse a raw ComfyUI error string into a structured ComfyUIErrorDetails.
 *
 * @param rawError - The error text from ComfyUI (HTTP response body, exception message, etc.)
 * @param httpStatus - Optional HTTP status code (e.g. 400, 500)
 * @param nodeInfo - Optional known node information to enrich the error
 */
export function parseComfyUIError(
	rawError: string,
	httpStatus?: number,
	nodeInfo?: { nodeId?: string; nodeTitle?: string; nodeClassType?: string },
): ComfyUIErrorDetails {
	// 1. Try to extract JSON error from ComfyUI responses
	//    ComfyUI errors can arrive in two shapes:
	//      { "error": { "type": "...", "message": "..." } }  — nested under "error" key
	//      { "type": "prompt_outputs_failed_validation", "message": "..." }  — flat structure
	let cleanError = rawError
	try {
		const parsed = JSON.parse(rawError)
		if (parsed.error) {
			cleanError = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error)
		} else if (parsed.type && parsed.message) {
			// Flat error structure: {"type":"prompt_outputs_failed_validation","message":"Prompt outputs failed validation"}
			cleanError = `${parsed.type}: ${parsed.message}`
		}
	} catch {
		// Not JSON, use as-is
	}

	// 2. Match against known patterns
	for (const pattern of ERROR_PATTERNS) {
		const m = pattern.test.exec(cleanError)
		if (m) {
			const extractedNode = pattern.extractNode?.(m) ?? {}
			const nodeId = nodeInfo?.nodeId ?? extractedNode.nodeId
			const nodeTitle = nodeInfo?.nodeTitle ?? extractedNode.nodeTitle
			const nodeClassType = nodeInfo?.nodeClassType ?? extractedNode.nodeClassType
			const nodeLabel = nodeTitle ?? nodeClassType ?? `Node ${nodeId ?? "?"}`

			const suggestion = pattern.suggestionTemplate
				.replace("{0}", nodeLabel)
				.replace("{1}", nodeClassType ?? "?")
				.replace("{2}", m[1] ?? cleanError)

			return {
				category: pattern.category,
				code: pattern.code,
				message: cleanError,
				nodeId,
				nodeTitle,
				nodeClassType,
				suggestion,
				rawError,
			}
		}
	}

	// 3. HTTP errors without a matching pattern
	if (httpStatus !== undefined) {
		return {
			category: "network_error",
			code: ComfyUIErrorCode.HTTP_ERROR,
			message: cleanError,
			suggestion: `The ComfyUI server returned HTTP ${httpStatus}. ${
				httpStatus >= 500
					? "This is likely a server-side issue. Ask the user to check the ComfyUI console."
					: httpStatus === 404
						? "The endpoint was not found. Check the ComfyUI server URL and version."
						: "Check the ComfyUI server configuration."
			}`,
			rawError,
		}
	}

	// 4. Fallback
	return {
		category: "unknown",
		code: ComfyUIErrorCode.UNKNOWN,
		message: cleanError,
		suggestion:
			"An unknown error occurred during image generation. Ask the user to check the ComfyUI console for details.",
		rawError,
	}
}
