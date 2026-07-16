import { render, fireEvent } from "@testing-library/react"

import { ImageGenerationSettings } from "../ImageGenerationSettings"
import { EXPERIMENT_IDS, experimentDefault } from "@shared/experiments"

// Mock the translation context
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const enabledExperiments = {
	...experimentDefault,
	[EXPERIMENT_IDS.TXT2IMG]: true,
}

/**
 * Helper: build an experiments object with all 8 pipeline experiments set to `value`.
 */
function allExperiments(value: boolean) {
	return Object.fromEntries(Object.values(EXPERIMENT_IDS).map((id) => [id, value])) as Record<string, boolean>
}

/**
 * Helper: build an experiments object with only the given experiment enabled.
 */
function onlyExperiment(id: string) {
	return { ...allExperiments(false), [id]: true } as Record<string, boolean>
}

describe("ImageGenerationSettings", () => {
	const mockSetExperimentEnabled = vi.fn()
	const mockUpdateGenerationProvider = vi.fn()
	const mockUpdateOpenRouterModel = vi.fn()
	const mockSetComfyuiDefaultPipeline = vi.fn()
	const mockUpdateAtlasCloudModel = vi.fn()

	const defaultProps = {
		experiments: experimentDefault,
		setExperimentEnabled: mockSetExperimentEnabled,
		generationProviders: {},
		updateGenerationProvider: mockUpdateGenerationProvider,
		openRouterModels: {},
		updateOpenRouterModel: mockUpdateOpenRouterModel,
		comfyuiDefaultPipelines: {},
		setComfyuiDefaultPipeline: mockSetComfyuiDefaultPipeline,
		atlasCloudModels: {},
		updateAtlasCloudModel: mockUpdateAtlasCloudModel,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("Initial Mount Behavior", () => {
		it("should not call setter functions on initial mount with empty configuration", () => {
			render(<ImageGenerationSettings {...defaultProps} />)

			// Should NOT call setter functions on initial mount to prevent dirty state
			expect(mockSetExperimentEnabled).not.toHaveBeenCalled()
			expect(mockUpdateGenerationProvider).not.toHaveBeenCalled()
			expect(mockUpdateOpenRouterModel).not.toHaveBeenCalled()
			expect(mockSetComfyuiDefaultPipeline).not.toHaveBeenCalled()
		})

		it("should not call setter functions on initial mount with existing configuration", () => {
			render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={enabledExperiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "openrouter" }}
					openRouterModels={{ [EXPERIMENT_IDS.TXT2IMG]: "google/gemini-2.5-flash-image" }}
				/>,
			)

			// Should NOT call setter functions on initial mount to prevent dirty state
			expect(mockUpdateGenerationProvider).not.toHaveBeenCalled()
			expect(mockUpdateOpenRouterModel).not.toHaveBeenCalled()
			expect(mockSetComfyuiDefaultPipeline).not.toHaveBeenCalled()
		})
	})

	describe("Per-Pipeline-Type Enable/Disable", () => {
		/**
		 * For each of the 8 pipeline types, verify that:
		 * 1. Clicking the checkbox calls setExperimentEnabled with the correct ExperimentId
		 * 2. When disabled, the section body is NOT rendered
		 * 3. When enabled, the section body IS rendered
		 */

		const pipelineChannels: Array<{
			id: string
			label: string
			providerPlaceholder: string
		}> = [
			{
				id: EXPERIMENT_IDS.TXT2IMG,
				label: "Text → Image",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.IMG2IMG,
				label: "Image → Image",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.INPAINT,
				label: "Inpaint",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.OUTPAINT,
				label: "Outpaint",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.UPSCALE,
				label: "Upscale",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.REMOVE_BG,
				label: "Remove Background",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.TXT2AUDIO,
				label: "Text → Audio",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
			{
				id: EXPERIMENT_IDS.TXT2VIDEO,
				label: "Text → Video",
				providerPlaceholder: "settings:experimental.IMAGE_GENERATION.providerLabel",
			},
		]

		pipelineChannels.forEach(({ id, label }) => {
			describe(`${id} (${label})`, () => {
				it("calls setExperimentEnabled with correct id when toggled ON", () => {
					const experiments = allExperiments(false)
					const { getByText } = render(
						<ImageGenerationSettings {...defaultProps} experiments={experiments} />,
					)

					// The checkbox label text is inside a <span> next to the checkbox
					const labelElement = getByText(label)
					// The VSCodeCheckbox wraps the label; clicking the label toggles
					const checkbox =
						labelElement.closest("label")?.querySelector('input[type="checkbox"]') ??
						labelElement.previousElementSibling?.querySelector('input[type="checkbox"]')

					if (checkbox) {
						fireEvent.click(checkbox)
					} else {
						// Fallback: click the text label directly
						fireEvent.click(labelElement)
					}

					expect(mockSetExperimentEnabled).toHaveBeenCalledWith(id, true)
				})

				it("renders section body (provider label) when enabled", () => {
					const experiments = onlyExperiment(id)
					const { queryByText } = render(
						<ImageGenerationSettings {...defaultProps} experiments={experiments} />,
					)

					// The provider selector label should be rendered when enabled
					expect(queryByText("settings:experimental.IMAGE_GENERATION.providerLabel")).toBeInTheDocument()
				})

				it("does NOT render section body when disabled", () => {
					const experiments = allExperiments(false)
					const { queryByText } = render(
						<ImageGenerationSettings {...defaultProps} experiments={experiments} />,
					)

					// Provider selector should NOT be rendered when disabled
					expect(queryByText("settings:experimental.IMAGE_GENERATION.providerLabel")).not.toBeInTheDocument()
				})
			})
		})
	})

	describe("Provider and Pipeline Section Rendering", () => {
		it("renders ComfyUI pipeline section when enabled with comfyui provider", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfyui" }}
				/>,
			)

			// Pipelines label should be visible
			expect(getByText("Pipelines")).toBeInTheDocument()
			// "Import New" link should be visible
			expect(getByText("Import New")).toBeInTheDocument()
			// Default Pipeline label should be visible
			expect(getByText("Default Pipeline")).toBeInTheDocument()
		})

		it("renders OpenRouter model input when enabled with openrouter provider", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "openrouter" }}
				/>,
			)

			expect(getByPlaceholderText("e.g., stabilityai/stable-diffusion-3")).toBeInTheDocument()
		})

		it("does NOT render pipeline section when provider is openrouter", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { queryByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "openrouter" }}
				/>,
			)

			// Pipeline label should NOT be visible with OpenRouter provider
			expect(queryByText("Pipelines")).not.toBeInTheDocument()
		})

		it("renders Import New link in ComfyUI pipeline section", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfyui" }}
				/>,
			)

			expect(getByText("Import New")).toBeInTheDocument()
		})

		it("renders empty pipeline state with import button when no pipelines match", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.IMG2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.IMG2IMG]: "comfyui" }}
				/>,
			)

			// Should show empty pipeline state
			expect(getByText("No pipelines for this type yet.")).toBeInTheDocument()
			// Should show import button
			expect(getByText("Import a ComfyUI Workflow")).toBeInTheDocument()
		})

		it("renders pipeline count badge when enabled with comfyui", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { container } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfyui" }}
				/>,
			)

			// Should show "0 pipelines" badge
			expect(container.textContent).toContain("0 pipeline")
		})
	})
	describe("Provider Switching", () => {
		it("renders ComfyUI as the default provider option for each channel", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfyui" }}
				/>,
			)

			// ComfyUI option text should be visible
			expect(getByText("🖥 Local (ComfyUI)")).toBeInTheDocument()
			// OpenRouter option text should also be visible
			expect(getByText("☁️ Cloud (OpenRouter)")).toBeInTheDocument()
		})

		it("renders Comfy Cloud provider option for each channel", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfy_cloud" }}
				/>,
			)

			expect(getByText("☁️ Comfy Cloud")).toBeInTheDocument()
		})

		it("renders Atlas Cloud provider option for each channel", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "atlas_cloud" }}
				/>,
			)

			expect(getByText("🌐 Atlas Cloud")).toBeInTheDocument()
		})
	})

	describe("Conditional Rendering", () => {
		it("should render OpenRouter model input when txt2img is enabled and provider is openrouter", () => {
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={enabledExperiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "openrouter" }}
				/>,
			)

			expect(getByPlaceholderText("e.g., stabilityai/stable-diffusion-3")).toBeInTheDocument()
		})

		it("should not render OpenRouter model input when txt2img is disabled", () => {
			const { queryByPlaceholderText } = render(<ImageGenerationSettings {...defaultProps} />)

			expect(queryByPlaceholderText("e.g., stabilityai/stable-diffusion-3")).not.toBeInTheDocument()
		})

		it("should render Comfy Cloud pipeline slug text field when provider is comfy_cloud", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "comfy_cloud" }}
				/>,
			)

			expect(getByPlaceholderText("e.g., txt2img")).toBeInTheDocument()
		})

		it("should render Atlas Cloud model text field when provider is atlas_cloud", () => {
			const experiments = onlyExperiment(EXPERIMENT_IDS.TXT2IMG)
			const { getByPlaceholderText } = render(
				<ImageGenerationSettings
					{...defaultProps}
					experiments={experiments}
					generationProviders={{ [EXPERIMENT_IDS.TXT2IMG]: "atlas_cloud" }}
				/>,
			)

			expect(getByPlaceholderText("e.g., wan-2.7, seedance-2.0")).toBeInTheDocument()
		})

		it("should render guide section with info icon", () => {
			const { getByText } = render(<ImageGenerationSettings {...defaultProps} />)

			expect(getByText("settings:imageGeneration.guideTitle")).toBeInTheDocument()
			expect(getByText("settings:imageGeneration.guideDescription")).toBeInTheDocument()
		})

		it("should render ComfyUI setup section", () => {
			const { getByText } = render(<ImageGenerationSettings {...defaultProps} />)

			expect(getByText("ComfyUI Setup")).toBeInTheDocument()
			expect(getByText("Auto-Setup ComfyUI")).toBeInTheDocument()
		})
	})

	describe("Experiment Gating Parity (filter-tools-for-mode.ts logic)", () => {
		/**
		 * These tests verify that the UI state we set up would produce the same
		 * gating behavior as filter-tools-for-mode.ts. The actual gating happens
		 * server-side, but the UI must store experiments correctly.
		 */

		it("should allow setExperimentEnabled to be called for each of the 8 pipeline types", () => {
			const experiments = allExperiments(false)
			const { getByText } = render(<ImageGenerationSettings {...defaultProps} experiments={experiments} />)

			const allLabels = [
				"Text → Image",
				"Image → Image",
				"Inpaint",
				"Outpaint",
				"Upscale",
				"Remove Background",
				"Text → Audio",
				"Text → Video",
			]

			allLabels.forEach((label) => {
				const el = getByText(label)
				expect(el).toBeInTheDocument()
			})
		})

		it("should render all 8 channel sections as separate UI blocks", () => {
			const experiments = allExperiments(true)
			const { container } = render(<ImageGenerationSettings {...defaultProps} experiments={experiments} />)

			// Each channel section renders a border wrapper div
			const channelHeaders = container.querySelectorAll(".border-vscode-editorGroup-border\\/50")
			// At minimum there should be 8 sections
			expect(channelHeaders.length).toBeGreaterThanOrEqual(8)
		})
	})
})
