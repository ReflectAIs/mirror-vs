/**
 * allowlists.ts — Data types for pipeline allowlists.
 *
 * Allowlists control which pipelines the LLM can use for image generation:
 *
 * 1. **Global allowlist** — if set, the LLM can only use the listed pipeline
 *    slugs. If null or empty, all pipelines are available (backward compatible).
 *
 * 2. **Per-model allowlist** — maps a model identifier (e.g. "sd_xl_turbo")
 *    to an array of allowed pipeline slugs. If null or empty for a given model,
 *    that model can use all globally-allowed pipelines.
 *
 * Both are persisted in extension global state via contextProxy.setValue().
 */

/**
 * Pipeline allowlists stored in extension global state.
 *
 * Stored as two separate keys in GlobalSettings:
 *   - "allowedPipelines": string[] | null
 *   - "modelPipelineAllowlist": Record<string, string[]> | null
 */
export interface PipelineAllowlists {
	/**
	 * Global toggle: which pipeline slugs the LLM is allowed to use.
	 * - `null` or `[]` → all pipelines allowed (backward compatible)
	 * - non-empty → only these pipeline slugs are available
	 */
	allowedPipelines: string[] | null

	/**
	 * Per-model: which pipeline slugs each model can use.
	 * Key = model identifier (e.g. "sd_xl_turbo", "sd_1.5", "flux.1-schnell")
	 * Value = allowed pipeline slugs for that model
	 *
	 * - `null` or `{}` → all globally-allowed pipelines available to all models
	 * - If a model key is missing → that model uses the global allowlist only
	 */
	modelPipelineAllowlist: Record<string, string[]> | null
}

/**
 * Default (fully permissive) allowlists — identical to "no allowlist".
 */
export const DEFAULT_ALLOWLISTS: PipelineAllowlists = {
	allowedPipelines: null,
	modelPipelineAllowlist: null,
}
