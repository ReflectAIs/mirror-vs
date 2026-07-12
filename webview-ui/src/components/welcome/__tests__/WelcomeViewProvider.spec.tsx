// npx vitest src/components/welcome/__tests__/WelcomeViewProvider.spec.tsx

import { render, screen, fireEvent } from "@/utils/test-utils"
import { openRouterDefaultModelId } from "@mirror-vs/types"

import * as ExtensionStateContext from "@src/context/ExtensionStateContext"
const { ExtensionStateContextProvider } = ExtensionStateContext

import WelcomeViewProvider from "../WelcomeViewProvider"
import { vscode } from "@src/utils/vscode"

vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, variant }: any) => (
		<button onClick={onClick} data-testid={`button-${variant}`}>
			{children}
		</button>
	),
}))

vi.mock("../../settings/ApiOptions", () => ({
	default: ({ apiConfiguration }: any) => (
		<div
			data-testid="api-options"
			data-provider={apiConfiguration.apiProvider}
			data-model={apiConfiguration.openRouterModelId}>
			API Options Component
		</div>
	),
}))

vi.mock("../../common/Tab", () => ({
	Tab: ({ children }: any) => <div data-testid="tab">{children}</div>,
	TabContent: ({ children }: any) => <div data-testid="tab-content">{children}</div>,
}))

vi.mock("../MirrorHero", () => ({
	default: () => <div data-testid="mirror-hero">Mirror Hero</div>,
}))

vi.mock("../MirrorTips", () => ({
	default: () => <div data-testid="mirror-tips">Mirror Tips</div>,
}))

vi.mock("../WelcomeStepIndicator", () => ({
	default: ({ steps, currentStep }: any) => (
		<div data-testid="welcome-step-indicator" data-current-step={currentStep} data-step-count={steps?.length}>
			Step Indicator
		</div>
	),
}))

vi.mock("lucide-react", () => ({
	ArrowLeft: () => <span data-testid="arrow-left-icon">left</span>,
	Brain: () => <span data-testid="brain-icon">brain</span>,
	Sparkles: () => <span data-testid="sparkles-icon">sparkles</span>,
}))

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("react-i18next", () => ({
	Trans: ({ i18nKey, children }: any) => <span data-testid={`trans-${i18nKey}`}>{children || i18nKey}</span>,
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const renderWelcomeViewProvider = (extensionState = {}) => {
	const useExtensionStateMock = vi.spyOn(ExtensionStateContext, "useExtensionState")
	const setApiConfiguration = vi.fn()
	useExtensionStateMock.mockReturnValue({
		apiConfiguration: {},
		currentApiConfigName: "default",
		setApiConfiguration,
		uriScheme: "vscode",
		...extensionState,
	} as any)

	render(
		<ExtensionStateContextProvider>
			<WelcomeViewProvider />
		</ExtensionStateContextProvider>,
	)

	return { useExtensionStateMock, setApiConfiguration }
}

describe("WelcomeViewProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders the landing screen by default", () => {
		renderWelcomeViewProvider()

		expect(screen.getByText(/welcome:landing.greeting/)).toBeInTheDocument()
		expect(screen.getByTestId("trans-welcome:landing.introduction")).toBeInTheDocument()
		expect(screen.getByTestId("button-primary")).toBeInTheDocument()
		expect(screen.getByText(/welcome:importSettings/)).toBeInTheDocument()
	})

	it("shows the step indicator and mirror tips on the landing screen", () => {
		renderWelcomeViewProvider()

		expect(screen.getByTestId("welcome-step-indicator")).toBeInTheDocument()
		expect(screen.getByTestId("welcome-step-indicator")).toHaveAttribute("data-current-step", "0")
		expect(screen.getByTestId("mirror-tips")).toBeInTheDocument()
		expect(screen.getByTestId("mirror-hero")).toBeInTheDocument()
	})

	it("opens provider setup when Get Started is clicked", () => {
		const { setApiConfiguration } = renderWelcomeViewProvider()

		fireEvent.click(screen.getByTestId("button-primary"))

		expect(screen.getByTestId("api-options")).toBeInTheDocument()
		expect(screen.getByTestId("api-options")).toHaveAttribute("data-provider", "openrouter")
		expect(screen.getByTestId("api-options")).toHaveAttribute("data-model", openRouterDefaultModelId)
		expect(setApiConfiguration).toHaveBeenCalledWith({
			apiProvider: "openrouter",
			openRouterModelId: openRouterDefaultModelId,
		})
		expect(screen.getByTestId("trans-welcome:providerSignup.chooseProvider")).toBeInTheDocument()
		expect(vscode.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "upsertApiConfiguration" }))
	})

	it("shows step indicator on provider setup step", () => {
		renderWelcomeViewProvider()

		fireEvent.click(screen.getByTestId("button-primary"))

		expect(screen.getByTestId("welcome-step-indicator")).toHaveAttribute("data-current-step", "1")
	})

	it("treats the built-in Anthropic default as empty onboarding config", () => {
		const { setApiConfiguration } = renderWelcomeViewProvider({
			apiConfiguration: {
				apiProvider: "anthropic",
				apiModelId: "claude-sonnet-4-5",
			},
		})

		fireEvent.click(screen.getByTestId("button-primary"))

		expect(screen.getByTestId("api-options")).toHaveAttribute("data-provider", "openrouter")
		expect(screen.getByTestId("api-options")).toHaveAttribute("data-model", openRouterDefaultModelId)
		expect(setApiConfiguration).toHaveBeenCalledWith({
			apiProvider: "openrouter",
			openRouterModelId: openRouterDefaultModelId,
		})
	})

	it("saves the configured provider and transitions to completion step", () => {
		renderWelcomeViewProvider({ apiConfiguration: { apiProvider: "openrouter" } })

		fireEvent.click(screen.getByTestId("button-primary"))
		fireEvent.click(screen.getByText(/welcome:providerSignup.finish/))

		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "upsertApiConfiguration",
			text: "default",
			apiConfiguration: {
				apiProvider: "openrouter",
			},
		})
	})

	it("shows the completion screen after provider setup is saved", () => {
		renderWelcomeViewProvider({ apiConfiguration: { apiProvider: "openrouter" } })

		fireEvent.click(screen.getByTestId("button-primary"))
		fireEvent.click(screen.getByText(/welcome:providerSignup.finish/))

		expect(screen.getByText(/welcome:complete.heading/)).toBeInTheDocument()
		expect(screen.getByTestId("trans-welcome:complete.description")).toBeInTheDocument()
		expect(screen.getByText(/welcome:complete.startExploring/)).toBeInTheDocument()
	})

	it("shows the sparkles icon and step indicator on the completion screen", () => {
		renderWelcomeViewProvider({ apiConfiguration: { apiProvider: "openrouter" } })

		fireEvent.click(screen.getByTestId("button-primary"))
		fireEvent.click(screen.getByText(/welcome:providerSignup.finish/))

		expect(screen.getByTestId("sparkles-icon")).toBeInTheDocument()
		expect(screen.getByTestId("welcome-step-indicator")).toHaveAttribute("data-current-step", "2")
	})

	it("navigates to chat when Start Exploring is clicked on completion screen", () => {
		renderWelcomeViewProvider({ apiConfiguration: { apiProvider: "openrouter" } })

		fireEvent.click(screen.getByTestId("button-primary"))
		fireEvent.click(screen.getByText(/welcome:providerSignup.finish/))

		const startExploringButton = screen.getByText(/welcome:complete.startExploring/)
		fireEvent.click(startExploringButton)

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "switchTab", tab: "chat" })
	})

	it("returns to landing from provider setup", () => {
		renderWelcomeViewProvider()

		fireEvent.click(screen.getByTestId("button-primary"))
		fireEvent.click(screen.getByTestId("button-secondary"))

		expect(screen.getByText(/welcome:landing.greeting/)).toBeInTheDocument()
		expect(screen.queryByTestId("api-options")).not.toBeInTheDocument()
	})

	it("imports settings from the landing screen", () => {
		renderWelcomeViewProvider()

		fireEvent.click(screen.getByText(/welcome:importSettings/))

		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "importSettings" })
	})
})
