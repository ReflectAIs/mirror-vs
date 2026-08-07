import { z } from "zod"

import type { Keys, Equals, AssertEqual } from "./type-fu.js"

/**
 * ExperimentId
 *
 * NOTE: "imageGeneration" was removed in favour of 8 per-pipeline-type
 * experiments.  A Zod .transform() migrates legacy `imageGeneration: true`
 * to `txt2img: true` automatically.
 */

export const experimentIds = [
	"preventFocusDisruption",
	"txt2img",
	"img2img",
	"inpaint",
	"outpaint",
	"upscale",
	"remove-bg",
	"txt2audio",
	"txt2video",
	"runSlashCommand",
	"customTools",
	"browser",
	"parallelToolReads",
	"multiTab",
] as const

export const experimentIdsSchema = z.enum(experimentIds)

export type ExperimentId = z.infer<typeof experimentIdsSchema>

/**
 * Experiments
 *
 * The schema accepts the legacy `imageGeneration` key during parse but strips
 * it from the output, migrating `imageGeneration: true` → `txt2img: true`.
 */

export const experimentsSchema = z
	.object({
		preventFocusDisruption: z.boolean().optional(),
		// Legacy field – accepted on input, removed by .transform()
		imageGeneration: z.boolean().optional(),
		txt2img: z.boolean().optional(),
		img2img: z.boolean().optional(),
		inpaint: z.boolean().optional(),
		outpaint: z.boolean().optional(),
		upscale: z.boolean().optional(),
		"remove-bg": z.boolean().optional(),
		txt2audio: z.boolean().optional(),
		txt2video: z.boolean().optional(),
		runSlashCommand: z.boolean().optional(),
		customTools: z.boolean().optional(),
		browser: z.boolean().optional(),
		parallelToolReads: z.boolean().optional(),
		multiTab: z.boolean().optional(),
	})
	.transform((data) => {
		// Strip the legacy field so it does not appear in the output type
		const { imageGeneration, ...rest } = data
		// Migrate legacy blanket-enable to txt2img (primary image pipeline)
		if (imageGeneration && !rest.txt2img) {
			rest.txt2img = true
		}
		return rest
	})

export type Experiments = z.infer<typeof experimentsSchema>

type _AssertExperiments = AssertEqual<Equals<ExperimentId, Keys<Experiments>>>
