import type { AssertEqual, Equals, Keys, Values, ExperimentId, Experiments } from "@mirror-vs/types"

export const EXPERIMENT_IDS = {
	PREVENT_FOCUS_DISRUPTION: "preventFocusDisruption",
	TXT2IMG: "txt2img",
	IMG2IMG: "img2img",
	INPAINT: "inpaint",
	OUTPAINT: "outpaint",
	UPSCALE: "upscale",
	REMOVE_BG: "remove-bg",
	TXT2AUDIO: "txt2audio",
	TXT2VIDEO: "txt2video",
	RUN_SLASH_COMMAND: "runSlashCommand",
	CUSTOM_TOOLS: "customTools",
	BROWSER: "browser",
	PARALLEL_TOOL_READS: "parallelToolReads",
	MULTI_TAB: "multiTab",
} as const satisfies Record<string, ExperimentId>

type _AssertExperimentIds = AssertEqual<Equals<ExperimentId, Values<typeof EXPERIMENT_IDS>>>

type ExperimentKey = Keys<typeof EXPERIMENT_IDS>

interface ExperimentConfig {
	enabled: boolean
}

export const experimentConfigsMap: Record<ExperimentKey, ExperimentConfig> = {
	PREVENT_FOCUS_DISRUPTION: { enabled: false },
	TXT2IMG: { enabled: false },
	IMG2IMG: { enabled: false },
	INPAINT: { enabled: false },
	OUTPAINT: { enabled: false },
	UPSCALE: { enabled: false },
	REMOVE_BG: { enabled: false },
	TXT2AUDIO: { enabled: false },
	TXT2VIDEO: { enabled: false },
	RUN_SLASH_COMMAND: { enabled: false },
	CUSTOM_TOOLS: { enabled: false },
	BROWSER: { enabled: false },
	PARALLEL_TOOL_READS: { enabled: false },
	MULTI_TAB: { enabled: false },
}

export const experimentDefault = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(
		([_, config]) => [EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId, config.enabled] as const,
	),
) as Record<ExperimentId, boolean>

export const experiments = {
	get: (id: ExperimentKey): ExperimentConfig | undefined => experimentConfigsMap[id],
	isEnabled: (experimentsConfig: Experiments, id: ExperimentId) => experimentsConfig[id] ?? experimentDefault[id],
} as const
