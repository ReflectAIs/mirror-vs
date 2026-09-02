/**
 * Settings passed to system prompt generation functions
 */
export interface SystemPromptSettings {
	todoListEnabled: boolean
	useAgentRules: boolean
	/** When true, recursively discover and load .mirror/rules from subdirectories */
	enableSubfolderRules?: boolean
	newTaskRequireTodos: boolean
	/** When true, model should hide vendor/company identity in responses */
	isStealthModel?: boolean
	/** Selected reasoning effort level (low, medium, high) */
	reasoningEffort?: string
	/** When true, model supports native API reasoning parameters (budget_tokens, reasoning_effort) */
	supportsNativeReasoning?: boolean
}
