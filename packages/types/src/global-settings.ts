import { z } from "zod"

import { type Keys } from "./type-fu.js"
import {
	type ProviderSettings,
	PROVIDER_SETTINGS_KEYS,
	providerSettingsEntrySchema,
	providerSettingsSchema,
} from "./provider-settings.js"
import { historyItemSchema } from "./history.js"
import { codebaseIndexModelsSchema, codebaseIndexConfigSchema } from "./codebase-index.js"
import { experimentsSchema } from "./experiment.js"
import { modeConfigSchema } from "./mode.js"
import { customModePromptsSchema, customSupportPromptsSchema } from "./mode.js"
import { toolNamesSchema } from "./tool.js"
import { sharedSessionContextSchema } from "./session.js"
import { languagesSchema } from "./vscode.js"

/**
 * Default delay in milliseconds after writes to allow diagnostics to detect potential problems.
 * This delay is particularly important for Go and other languages where tools like goimports
 * need time to automatically clean up unused imports.
 */
export const DEFAULT_WRITE_DELAY_MS = 1000

/**
 * Terminal output preview size options for persisted command output.
 *
 * Controls how much command output is kept in memory as a "preview" before
 * the LLM decides to retrieve more via `read_command_output`. Larger previews
 * mean more immediate context but consume more of the context window.
 *
 * - `small`: 5KB preview - Best for long-running commands with verbose output
 * - `medium`: 10KB preview - Balanced default for most use cases
 * - `large`: 20KB preview - Best when commands produce critical info early
 *
 * @see OutputInterceptor - Uses this setting to determine when to spill to disk
 * @see PersistedCommandOutput - Contains the resulting preview and artifact reference
 */
export type TerminalOutputPreviewSize = "small" | "medium" | "large"

/**
 * Byte limits for each terminal output preview size.
 *
 * Maps preview size names to their corresponding byte thresholds.
 * When command output exceeds these thresholds, the excess is persisted
 * to disk and made available via the `read_command_output` tool.
 */
export const TERMINAL_PREVIEW_BYTES: Record<TerminalOutputPreviewSize, number> = {
	small: 5 * 1024, // 5KB
	medium: 10 * 1024, // 10KB
	large: 20 * 1024, // 20KB
}

/**
 * Default terminal output preview size.
 * The "medium" (10KB) setting provides a good balance between immediate
 * visibility and context window conservation for most use cases.
 */
export const DEFAULT_TERMINAL_OUTPUT_PREVIEW_SIZE: TerminalOutputPreviewSize = "medium"

/**
 * Minimum checkpoint timeout in seconds.
 */
export const MIN_CHECKPOINT_TIMEOUT_SECONDS = 10

/**
 * Maximum checkpoint timeout in seconds.
 */
export const MAX_CHECKPOINT_TIMEOUT_SECONDS = 60

/**
 * Default checkpoint timeout in seconds.
 */
export const DEFAULT_CHECKPOINT_TIMEOUT_SECONDS = 15

/**
 * GlobalSettings
 */

export const globalSettingsSchema = z.object({
	currentApiConfigName: z.string().optional(),
	listApiConfigMeta: z.array(providerSettingsEntrySchema).optional(),
	pinnedApiConfigs: z.record(z.string(), z.boolean()).optional(),

	lastShownAnnouncementId: z.string().optional(),
	customInstructions: z.string().optional(),
	taskHistory: z.array(historyItemSchema).optional(),
	dismissedUpsells: z.array(z.string()).optional(),

	// Image generation settings (experimental) - flattened for simplicity
	imageGenerationProvider: z.enum(["openrouter", "comfyui", "comfy_cloud", "atlas_cloud"]).optional(),
	openRouterImageApiKey: z.string().optional(),
	openRouterImageGenerationSelectedModel: z.string().optional(),
	comfyuiAutoSetup: z.boolean().optional(),
	comfyuiPort: z.number().optional(),
	comfyuiModel: z.string().optional(),

	customCondensingPrompt: z.string().optional(),

	autoApprovalEnabled: z.boolean().optional(),
	autonomousMode: z.boolean().optional(),
	alwaysAllowReadOnly: z.boolean().optional(),
	alwaysAllowReadOnlyOutsideWorkspace: z.boolean().optional(),
	alwaysAllowWrite: z.boolean().optional(),
	alwaysAllowWriteOutsideWorkspace: z.boolean().optional(),
	alwaysAllowWriteProtected: z.boolean().optional(),
	writeDelayMs: z.number().min(0).optional(),
	requestDelaySeconds: z.number().optional(),
	alwaysAllowMcp: z.boolean().optional(),
	alwaysAllowModeSwitch: z.boolean().optional(),
	alwaysAllowSubtasks: z.boolean().optional(),
	alwaysAllowExecute: z.boolean().optional(),
	alwaysAllowGitCommit: z.boolean().optional(),
	alwaysAllowFollowupQuestions: z.boolean().optional(),
	alwaysAllowBrowser: z.boolean().optional(),
	followupAutoApproveTimeoutMs: z.number().optional(),
	allowedCommands: z.array(z.string()).optional(),
	deniedCommands: z.array(z.string()).optional(),
	commandExecutionTimeout: z.number().optional(),
	commandTimeoutAllowlist: z.array(z.string()).optional(),
	preventCompletionWithOpenTodos: z.boolean().optional(),
	allowedMaxRequests: z.number().nullish(),
	allowedMaxCost: z.number().nullish(),
	autoCondenseContext: z.boolean().optional(),
	autoCondenseContextPercent: z.number().optional(),

	/**
	 * Whether to include current time in the environment details
	 * @default true
	 */
	includeCurrentTime: z.boolean().optional(),
	/**
	 * Whether to include current cost in the environment details
	 * @default true
	 */
	includeCurrentCost: z.boolean().optional(),
	/**
	 * Maximum number of git status file entries to include in the environment details.
	 * Set to 0 to disable git status. The header (branch, commits) is always included when > 0.
	 * @default 0
	 */
	maxGitStatusFiles: z.number().optional(),

	/**
	 * Whether to include diagnostic messages (errors, warnings) in tool outputs
	 * @default true
	 */
	includeDiagnosticMessages: z.boolean().optional(),
	/**
	 * Maximum number of diagnostic messages to include in tool outputs
	 * @default 50
	 */
	maxDiagnosticMessages: z.number().optional(),

	enableCheckpoints: z.boolean().optional(),
	checkpointTimeout: z
		.number()
		.int()
		.min(MIN_CHECKPOINT_TIMEOUT_SECONDS)
		.max(MAX_CHECKPOINT_TIMEOUT_SECONDS)
		.optional(),

	ttsEnabled: z.boolean().optional(),
	ttsSpeed: z.number().optional(),
	soundEnabled: z.boolean().optional(),
	soundVolume: z.number().optional(),
	mascotTheme: z.enum(["cyberpunk", "retro", "synthwave", "solar"]).optional(),
	soundTheme: z.enum(["classic", "scifi"]).optional(),

	maxOpenTabsContext: z.number().optional(),
	maxWorkspaceFiles: z.number().optional(),
	showMirrorIgnoredFiles: z.boolean().optional(),
	enableSubfolderRules: z.boolean().optional(),
	maxImageFileSize: z.number().optional(),
	maxTotalImageSize: z.number().optional(),

	terminalOutputPreviewSize: z.enum(["small", "medium", "large"]).optional(),
	terminalShellIntegrationTimeout: z.number().optional(),
	terminalShellIntegrationDisabled: z.boolean().optional(),
	terminalCommandDelay: z.number().optional(),
	terminalPowershellCounter: z.boolean().optional(),
	terminalZshClearEolMark: z.boolean().optional(),
	terminalZshOhMy: z.boolean().optional(),
	terminalZshP10k: z.boolean().optional(),
	terminalZdotdir: z.boolean().optional(),
	execaShellPath: z.string().optional(),

	diagnosticsEnabled: z.boolean().optional(),

	rateLimitSeconds: z.number().optional(),
	experiments: experimentsSchema.optional(),

	codebaseIndexModels: codebaseIndexModelsSchema.optional(),
	codebaseIndexConfig: codebaseIndexConfigSchema.optional(),

	language: languagesSchema.optional(),

	mcpEnabled: z.boolean().optional(),
	mcpToolsThreshold: z.number().optional(),

	mode: z.string().optional(),
	modeApiConfigs: z.record(z.string(), z.string()).optional(),
	customModes: z.array(modeConfigSchema).optional(),
	customModePrompts: customModePromptsSchema.optional(),
	customSupportPrompts: customSupportPromptsSchema.optional(),
	enhancementApiConfigId: z.string().optional(),
	includeTaskHistoryInEnhance: z.boolean().optional(),
	historyPreviewCollapsed: z.boolean().optional(),
	reasoningBlockCollapsed: z.boolean().optional(),
	/**
	 * Controls the keyboard behavior for sending messages in the chat input.
	 * - "send": Enter sends message, Shift+Enter creates newline (default)
	 * - "newline": Enter creates newline, Shift+Enter/Ctrl+Enter sends message
	 * @default "send"
	 */
	enterBehavior: z.enum(["send", "newline"]).optional(),
	profileThresholds: z.record(z.string(), z.number()).optional(),
	hasOpenedModeSelector: z.boolean().optional(),
	lastModeExportPath: z.string().optional(),
	lastModeImportPath: z.string().optional(),
	lastSettingsExportPath: z.string().optional(),
	lastTaskExportPath: z.string().optional(),
	lastImageSavePath: z.string().optional(),

	/**
	 * Path to worktree to auto-open after switching workspaces.
	 * Used by the worktree feature to open the Mirror VS sidebar in a new window.
	 */
	worktreeAutoOpenPath: z.string().optional(),
	/**
	 * Whether to show the worktree selector in the home screen.
	 * @default true
	 */
	showWorktreesInHomeScreen: z.boolean().optional(),

	/**
	 * List of native tool names to globally disable.
	 * Tools in this list will be excluded from prompt generation and rejected at execution time.
	 */
	disabledTools: z.array(toolNamesSchema).optional(),

	/**
	 * ID of the active session, persisted across restarts.
	 * Tasks created during the same session share this ID for history grouping.
	 */
	currentSessionId: z.string().optional(),

	/**
	 * Maps workspace paths to their respective active sessionId.
	 * Isolates sessions per workspace.
	 */
	workspaceSessionMap: z.record(z.string(), z.string()).optional(),

	/**
	 * User-assigned or auto-generated names for sessions.
	 * Keyed by sessionId UUID.
	 */
	sessionNames: z.record(z.string(), z.string()).optional(),

	/**
	 * User-assigned display names for individual tasks/tabs.
	 * Keyed by taskId.
	 */
	taskNames: z.record(z.string(), z.string()).optional(),

	/**
	 * Tracks task IDs that the user has explicitly closed within each session.
	 * Keyed by sessionId, values are arrays of taskId strings.
	 * Closed tabs are excluded from session tab restoration on next startup.
	 */
	sessionClosedTabs: z.record(z.string(), z.array(z.string())).optional(),

	/**
	 * Shared selective context between tabs in the same session:
	 * auto-extracted knowledge notes and user-curated notes.
	 * Keyed by sessionId UUID. See `SharedSessionContext` in session.ts.
	 */
	sessionSharedContexts: z.record(z.string(), sharedSessionContextSchema).optional(),

	activeSearchProvider: z.string().optional(),
	userBraveApiKey: z.string().optional(),

	/**
	 * Per-type active pipeline slug override for ComfyUI.
	 * Keys are pipeline types (e.g. "txt2img", "img2img", "txt2audio", "txt2video").
	 * Values are pipeline slugs (e.g. "txt2img-flash").
	 */
	comfyuiDefaultPipelines: z.record(z.string(), z.string()).optional(),

	/**
	 * Pipeline slugs the user has hidden (soft-deleted) from the UI and
	 * auto-selection. Built-in pipelines that the user wants to "remove"
	 * are added to this list so they no longer appear in dropdowns or
	 * get selected by `autoSelect()`.
	 */
	hiddenPipelines: z.array(z.string()).optional(),

	/**
	 * Cached hardware profile summary string (e.g. "apple-m2-32gb", "nvidia-rtx4090-24gb").
	 * Populated after the first hardware detection run.
	 */
	comfyuiHardwareProfile: z.string().optional(),

	/**
	 * HuggingFace API token for downloading gated models (e.g. FLUX, Stable Audio Open).
	 */
	huggingFaceApiToken: z.string().optional(),

	/**
	 * Per-pipeline-type provider selection.
	 * Maps pipeline type (e.g. "txt2img", "txt2audio") to the active runtime:
	 * - "comfyui": local ComfyUI generation
	 * - "openrouter": cloud dispatch via OpenRouter
	 * Falls back to "comfyui" for any unlisted type.
	 */
	generationProviders: z
		.record(z.string(), z.enum(["comfyui", "openrouter", "comfy_cloud", "atlas_cloud"]))
		.optional(),

	/**
	 * Per-pipeline-type OpenRouter model overrides.
	 * Maps pipeline type (e.g. "txt2img", "txt2audio") to an OpenRouter model slug
	 * (e.g. "stabilityai/stable-diffusion-3").
	 * Only meaningful when generationProviders[type] === "openrouter".
	 */
	openRouterModels: z.record(z.string(), z.string()).optional(),

	/**
	 * Per-pipeline-type Atlas Cloud model identifier overrides.
	 * Maps pipeline type (e.g. "txt2img", "txt2audio") to an Atlas Cloud model slug
	 * (e.g. "wan-2.7", "seedance-2.0").
	 * Only meaningful when generationProviders[type] === "atlas_cloud".
	 */
	atlasCloudModels: z.record(z.string(), z.string()).optional(),

	/**
	 * Comfy Cloud API token for authenticating with cloud.comfy.org.
	 * Stored in SecretStorage via GLOBAL_SECRET_KEYS.
	 */
	comfyCloudApiToken: z.string().optional(),

	/**
	 * Atlas Cloud API token for authenticating with Atlas Cloud API.
	 * Stored in SecretStorage via GLOBAL_SECRET_KEYS.
	 */
	atlasCloudApiToken: z.string().optional(),

	/**
	 * Global pipeline allowlist. When set, only these pipeline slugs
	 * are available to the LLM for image generation. null/empty = all
	 * pipelines allowed (backward compatible).
	 */
	allowedPipelines: z.array(z.string()).optional().nullable(),

	/**
	 * Per-model pipeline assignments.
	 * Key = model identifier (e.g. "sd_xl_turbo"), Value = allowed pipeline slugs.
	 * null/empty = model uses global allowlist only.
	 */
	modelPipelineAllowlist: z.record(z.string(), z.array(z.string())).optional().nullable(),
})

export type GlobalSettings = z.infer<typeof globalSettingsSchema>

export const GLOBAL_SETTINGS_KEYS = globalSettingsSchema.keyof().options

/**
 * MirrorVSSettings
 */

export const mirrorCodeSettingsSchema = providerSettingsSchema.merge(globalSettingsSchema)

export type MirrorVSSettings = GlobalSettings & ProviderSettings

/**
 * SecretState
 */
export const SECRET_STATE_KEYS = [
	"apiKey",
	"openRouterApiKey",
	"awsAccessKey",
	"awsApiKey",
	"awsSecretKey",
	"awsSessionToken",
	"openAiApiKey",
	"ollamaApiKey",
	"geminiApiKey",
	"openAiNativeApiKey",
	"deepSeekApiKey",
	"moonshotApiKey",
	"mistralApiKey",
	"minimaxApiKey",
	"requestyApiKey",
	"unboundApiKey",
	"xaiApiKey",
	"litellmApiKey",
	"codeIndexOpenAiKey",
	"codeIndexQdrantApiKey",
	"codebaseIndexOpenAiCompatibleApiKey",
	"codebaseIndexGeminiApiKey",
	"codebaseIndexMistralApiKey",
	"codebaseIndexVercelAiGatewayApiKey",
	"codebaseIndexOpenRouterApiKey",
	"sambaNovaApiKey",
	"zaiApiKey",
	"fireworksApiKey",
	"vercelAiGatewayApiKey",
	"basetenApiKey",
	"customApiKey",
	"codebaseIndexAnthropicApiKey",
	"codebaseIndexCohereApiKey",
	"codebaseIndexJinaApiKey",
	"codebaseIndexVoyageApiKey",
] as const

// Global secrets that are part of GlobalSettings (not ProviderSettings)
export const GLOBAL_SECRET_KEYS = [
	"openRouterImageApiKey", // For image generation
	"mirror_hf_api_token", // HuggingFace API token (stored in SecretStorage)
	"mirror_openrouter_api_token", // OpenRouter API token for generation runtime
	"mirror_comfy_cloud_api_token", // Comfy Cloud API token
	"mirror_atlas_cloud_api_token", // Atlas Cloud API token
] as const

// Type for the actual secret storage keys
type ProviderSecretKey = (typeof SECRET_STATE_KEYS)[number]
type GlobalSecretKey = (typeof GLOBAL_SECRET_KEYS)[number]

// Type representing all secrets that can be stored
export type SecretState = Pick<ProviderSettings, Extract<ProviderSecretKey, keyof ProviderSettings>> & {
	[K in GlobalSecretKey]?: string
}

export const isSecretStateKey = (key: string): key is Keys<SecretState> =>
	SECRET_STATE_KEYS.includes(key as ProviderSecretKey) || GLOBAL_SECRET_KEYS.includes(key as GlobalSecretKey)

/**
 * GlobalState
 */

export type GlobalState = Omit<MirrorVSSettings, Keys<SecretState>>

export const GLOBAL_STATE_KEYS = [...GLOBAL_SETTINGS_KEYS, ...PROVIDER_SETTINGS_KEYS].filter(
	(key: Keys<MirrorVSSettings>) => !isSecretStateKey(key),
) as Keys<GlobalState>[]

export const isGlobalStateKey = (key: string): key is Keys<GlobalState> =>
	GLOBAL_STATE_KEYS.includes(key as Keys<GlobalState>)
