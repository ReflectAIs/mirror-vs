// npx vitest run src/shared/__tests__/experiments.spec.ts

import type { ExperimentId } from "@mirror-vs/types"

import { EXPERIMENT_IDS, experimentConfigsMap, experiments as Experiments } from "../experiments"

describe("experiments", () => {
	describe("PREVENT_FOCUS_DISRUPTION", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION).toBe("preventFocusDisruption")
			expect(experimentConfigsMap.PREVENT_FOCUS_DISRUPTION).toMatchObject({
				enabled: false,
			})
		})
	})

	describe("isEnabled", () => {
		it("returns false when experiment is not enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				preventFocusDisruption: false,
				txt2img: false,
				img2img: false,
				inpaint: false,
				outpaint: false,
				upscale: false,
				"remove-bg": false,
				txt2audio: false,
				txt2video: false,
				runSlashCommand: false,
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(false)
		})

		it("returns true when experiment is enabled", () => {
			const experiments: Record<ExperimentId, boolean> = {
				preventFocusDisruption: true,
				txt2img: false,
				img2img: false,
				inpaint: false,
				outpaint: false,
				upscale: false,
				"remove-bg": false,
				txt2audio: false,
				txt2video: false,
				runSlashCommand: false,
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(true)
		})

		it("returns false when experiment is not present", () => {
			const experiments: Record<ExperimentId, boolean> = {
				preventFocusDisruption: false,
				txt2img: false,
				img2img: false,
				inpaint: false,
				outpaint: false,
				upscale: false,
				"remove-bg": false,
				txt2audio: false,
				txt2video: false,
				runSlashCommand: false,
				customTools: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(false)
		})
	})
})
