import { render, screen, fireEvent } from "@/utils/test-utils"
import { NormalSettingsView } from "../NormalSettingsView"
import { ExtensionStateContextType } from "@src/context/ExtensionStateContext"

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

	it("renders curated provider options and header badge", () => {
		renderNormalSettings()

		expect(screen.getByText("Normal Setup Mode")).toBeInTheDocument()
		expect(screen.getByText("OpenRouter")).toBeInTheDocument()
		expect(screen.getByText("Anthropic Claude")).toBeInTheDocument()
		expect(screen.getByText("OpenAI")).toBeInTheDocument()
		expect(screen.getByText("Google Gemini")).toBeInTheDocument()
		expect(screen.getByText("DeepSeek")).toBeInTheDocument()
		expect(screen.getByText("Ollama (Local AI)")).toBeInTheDocument()
	})

	it("switches provider when clicking a provider card", () => {
		renderNormalSettings()

		fireEvent.click(screen.getByText("Anthropic Claude"))

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiProvider", "anthropic")
		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("apiModelId", "claude-3-7-sonnet-20250219")
	})

	it("switches to Ollama and assigns default model and base URL", () => {
		renderNormalSettings()

		fireEvent.click(screen.getByText("Ollama (Local AI)"))

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
		expect(screen.getByText("Isolated Git Worktree Sandbox")).toBeInTheDocument()
		expect(screen.getByText("Sound Notifications")).toBeInTheDocument()
	})

	it("renders Custom API option and switches to it correctly", () => {
		renderNormalSettings()

		expect(screen.getByText("Custom API")).toBeInTheDocument()

		fireEvent.click(screen.getByText("Custom API"))

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
})
