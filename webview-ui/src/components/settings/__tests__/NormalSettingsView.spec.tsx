import { render, screen, fireEvent } from "@/utils/test-utils"
import { NormalSettingsView } from "../NormalSettingsView"
import { ExtensionStateContextType } from "@src/context/ExtensionStateContext"

vi.mock("@src/components/ui", async () => {
	const actual = await vi.importActual<any>("@src/components/ui")
	return {
		...actual,
		SearchableSelect: ({ value, onValueChange, options, placeholder, "data-testid": dataTestId }: any) => (
			<select
				value={value}
				onChange={(e) => {
					if (onValueChange) onValueChange(e.target.value)
				}}
				data-testid={dataTestId || "normal-provider-select"}>
				<option value="">{placeholder || "Select a provider"}</option>
				{options?.map((option: any) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		),
		Select: ({ children, value, onValueChange }: any) => (
			<div data-testid="select" data-value={value}>
				{children}
			</div>
		),
		SelectTrigger: ({ children }: any) => <div>{children}</div>,
		SelectValue: ({ children, placeholder }: any) => <div>{children || placeholder}</div>,
		SelectContent: ({ children }: any) => <div>{children}</div>,
		SelectItem: ({ children, value }: any) => (
			<div data-testid={`select-item-${value}`} data-value={value}>
				{children}
			</div>
		),
	}
})

describe("NormalSettingsView", () => {
	const mockSetCachedStateField = vi.fn()
	const mockSetApiConfigurationField = vi.fn()
	const mockSetExperimentEnabled = vi.fn()
	const mockOnSwitchToAdvanced = vi.fn()

	const defaultCachedState: ExtensionStateContextType = {
		settingsMode: "normal",
		alwaysAllowReadOnly: true,
		alwaysAllowWrite: false,
		alwaysAllowExecute: false,
		autonomousMode: false,
		enableCheckpoints: true,
		autoCondenseContext: true,
		soundEnabled: true,
		experiments: { gitWorktreeSandbox: false },
		language: "en",
		mascotTheme: "cyberpunk",
		apiConfiguration: {
			apiProvider: "openrouter",
			apiKey: "test-openrouter-key",
			openRouterModelId: "anthropic/claude-sonnet-4.5",
		},
	} as any

	const renderNormalSettings = (cachedState = defaultCachedState) => {
		return render(
			<NormalSettingsView
				cachedState={cachedState}
				setCachedStateField={mockSetCachedStateField}
				setApiConfigurationField={mockSetApiConfigurationField}
				setExperimentEnabled={mockSetExperimentEnabled}
				onSwitchToAdvanced={mockOnSwitchToAdvanced}
			/>,
		)
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders provider select dropdown with options", () => {
		renderNormalSettings()

		const select = screen.getByTestId("normal-provider-select") as HTMLSelectElement
		expect(select).toBeInTheDocument()
		expect(select.value).toBe("openrouter")
	})

	it("switches provider when selecting from dropdown", () => {
		renderNormalSettings()

		const select = screen.getByTestId("normal-provider-select")
		fireEvent.change(select, { target: { value: "anthropic" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiProvider", "anthropic")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiModelId", "claude-3-7-sonnet-20250219")
	})

	it("switches to Ollama and assigns default model and base URL", () => {
		renderNormalSettings()

		const select = screen.getByTestId("normal-provider-select")
		fireEvent.change(select, { target: { value: "ollama" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiProvider", "ollama")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("ollamaModelId", "qwen2.5-coder:latest")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("ollamaBaseUrl", "http://localhost:11434")
	})

	it("renders the 3 safety presets (Safe, Balanced, Autonomous)", () => {
		renderNormalSettings()

		expect(screen.getByText("Safe")).toBeInTheDocument()
		expect(screen.getByText("Balanced")).toBeInTheDocument()
		expect(screen.getByText("Autonomous")).toBeInTheDocument()
	})

	it("applies Safe preset correctly", () => {
		renderNormalSettings({
			...defaultCachedState,
			alwaysAllowWrite: true,
			alwaysAllowExecute: true,
		})

		fireEvent.click(screen.getByText("Safe"))

		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowReadOnly", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowWrite", false)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowExecute", false)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("autonomousMode", false)
	})

	it("applies Balanced preset correctly", () => {
		renderNormalSettings()

		fireEvent.click(screen.getByText("Balanced"))

		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowReadOnly", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowWrite", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowExecute", false)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("autonomousMode", false)
	})

	it("applies Autonomous preset correctly", () => {
		renderNormalSettings()

		fireEvent.click(screen.getByText("Autonomous"))

		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowReadOnly", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowWrite", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("alwaysAllowExecute", true)
		expect(mockSetCachedStateField).toHaveBeenCalledWith("autonomousMode", true)
	})

	it("calls onSwitchToAdvanced when clicking Advanced Mode button", () => {
		renderNormalSettings()

		const advancedButtons = screen.getAllByText(/Advanced Mode|Open Advanced Settings/i)
		fireEvent.click(advancedButtons[0])

		expect(mockOnSwitchToAdvanced).toHaveBeenCalled()
	})

	it("displays active status for checkpoints and smart context", () => {
		renderNormalSettings()

		expect(screen.getByText("Automatic Git Checkpoints")).toBeInTheDocument()
		expect(screen.getByText("Auto Context Condensing")).toBeInTheDocument()
		expect(screen.getByText("Sound Notifications")).toBeInTheDocument()
	})

	it("renders Custom API option and switches to it correctly", () => {
		renderNormalSettings()

		const select = screen.getByTestId("normal-provider-select")
		fireEvent.change(select, { target: { value: "custom" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiProvider", "custom")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("customModelId", "gpt-4o")
	})

	it("shows Custom API Base URL input when Custom API is active", () => {
		renderNormalSettings({
			...defaultCachedState,
			apiConfiguration: {
				apiProvider: "custom",
				customBaseUrl: "http://localhost:8000/v1",
				customModelId: "gpt-4o",
			},
		})

		expect(screen.getByText("Custom API Base URL")).toBeInTheDocument()
	})

	it("renders custom added model in the model selector without being blank", () => {
		renderNormalSettings({
			...defaultCachedState,
			apiConfiguration: {
				apiProvider: "relace",
				apiModelId: "custom-unlisted-relace-model",
			},
		})

		expect(screen.getByText("custom-unlisted-relace-model")).toBeInTheDocument()
	})

	it("renders curated model with its label when selected", () => {
		renderNormalSettings({
			...defaultCachedState,
			apiConfiguration: {
				apiProvider: "relace",
				apiModelId: "deepseek-ai/DeepSeek-V4-Flash-0731",
			},
		})

		expect(screen.getByText("DeepSeek V4 Flash 0731")).toBeInTheDocument()
	})
})
