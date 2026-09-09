// npx vitest run src/shared/__tests__/experiments.spec.ts

import type { ExperimentId } from "@mirror-vs/types"

import { EXPERIMENT_IDS, experimentConfigsMap, experimentDefault, experiments as Experiments } from "../experiments"

describe("experiments", () => {
	describe("graduated experiments", () => {
		it("LSP_CODE_GRAPH and GIT_WORKTREE_SANDBOX are enabled by default", () => {
			expect(experimentDefault.lspCodeGraph).toBe(true)
			expect(experimentDefault.gitWorktreeSandbox).toBe(true)
			expect(experimentConfigsMap.LSP_CODE_GRAPH).toMatchObject({ enabled: true })
			expect(experimentConfigsMap.GIT_WORKTREE_SANDBOX).toMatchObject({ enabled: true })
		})

		it("falls back to enabled default when not present in config", () => {
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
				browser: false,
				parallelToolReads: false,
				lspCodeGraph: false,
				gitWorktreeSandbox: false,
			}
			// Simulate absence by deleting the keys (runtime allows it even though the type doesn't)
			const partial = experiments as Partial<Record<ExperimentId, boolean>>
			delete partial.lspCodeGraph
			delete partial.gitWorktreeSandbox
			expect(
				Experiments.isEnabled(experiments as Record<ExperimentId, boolean>, EXPERIMENT_IDS.LSP_CODE_GRAPH),
			).toBe(true)
			expect(
				Experiments.isEnabled(
					experiments as Record<ExperimentId, boolean>,
					EXPERIMENT_IDS.GIT_WORKTREE_SANDBOX,
				),
			).toBe(true)
		})
	})

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
				browser: false,
				parallelToolReads: false,
				lspCodeGraph: false,
				gitWorktreeSandbox: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(false)
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.LSP_CODE_GRAPH)).toBe(false)
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.GIT_WORKTREE_SANDBOX)).toBe(false)
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
				browser: false,
				parallelToolReads: false,
				lspCodeGraph: true,
				gitWorktreeSandbox: true,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(true)
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.LSP_CODE_GRAPH)).toBe(true)
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.GIT_WORKTREE_SANDBOX)).toBe(true)
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
				browser: false,
				parallelToolReads: false,
				lspCodeGraph: false,
				gitWorktreeSandbox: false,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.PREVENT_FOCUS_DISRUPTION)).toBe(false)
		})
	})
})
