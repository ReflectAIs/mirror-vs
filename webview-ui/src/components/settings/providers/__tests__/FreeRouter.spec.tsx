import { render, screen, fireEvent } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { FreeRouter } from "../FreeRouter"
import type { ProviderSettings } from "@mirror-vs/types"

vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({ children, value, onInput, placeholder }: any) => (
		<div>
			{children}
			<input
				placeholder={placeholder}
				value={value}
				onChange={(e) => onInput({ target: { value: e.target.value } })}
			/>
		</div>
	),
	VSCodeButton: ({ children, onClick, title }: any) => (
		<button onClick={onClick} title={title}>
			{children}
		</button>
	),
	VSCodeLink: ({ children, href, onClick }: any) => (
		<a href={href} onClick={onClick}>
			{children}
		</a>
	),
}))

vi.mock("vscrui", () => ({
	Checkbox: ({ children, checked, onChange }: any) => (
		<label>
			<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
			{children}
		</label>
	),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@src/components/common/VSCodeButtonLink", () => ({
	VSCodeButtonLink: ({ children, href }: any) => <a href={href}>{children}</a>,
}))

vi.mock("../OpenRouterBalanceDisplay", () => ({
	OpenRouterBalanceDisplay: () => <div>Balance: $0.00</div>,
}))

const createWrapper = () => {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	})
	return ({ children }: { children: React.ReactNode }) => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	)
}

describe("FreeRouter component", () => {
	const defaultApiConfiguration: ProviderSettings = {
		apiProvider: "free-router",
		freeRouterApiKey: "",
		freeRouterCooldownMinutes: 10,
	}

	const mockSetApiConfigurationField = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders Free Router banner and explanation", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="google/gemma-4-31b-it:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		expect(screen.getByText("Free Models Auto-Router")).toBeInTheDocument()
		expect(screen.getByText(/Routes across high-performance free models/)).toBeInTheDocument()
	})

	it("renders OpenRouter Free API Key input and auth link when key is empty", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="google/gemma-4-31b-it:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		expect(screen.getByText("OpenRouter Free API Key")).toBeInTheDocument()
		expect(screen.getByText("Get Free OpenRouter API Key")).toBeInTheDocument()
	})

	it("renders Automated Model Routing Active indicator without manual model picker", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="google/gemma-4-31b-it:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		expect(screen.getByText("Automated Model Routing Active")).toBeInTheDocument()
		expect(screen.queryByText("Primary Preferred Model")).not.toBeInTheDocument()
		expect(screen.getByTestId("free-router-active-badge")).toHaveTextContent("Active: Gemma 4 31B")
		expect(screen.getByTestId("free-router-current-model-tag")).toHaveTextContent("Currently in Use")
	})

	it("reflects active model when apiModelId is set in apiConfiguration", () => {
		render(
			<FreeRouter
				apiConfiguration={{
					...defaultApiConfiguration,
					apiModelId: "qwen/qwen3.8-27b:free",
					freeRouterModels: ["google/gemma-4-31b-it:free", "qwen/qwen3.8-27b:free"],
				}}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="qwen/qwen3.8-27b:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		expect(screen.getByTestId("free-router-active-badge")).toHaveTextContent("Active: Qwen 3.8 27B")
		expect(screen.getByTestId("free-router-current-model-tag")).toHaveTextContent("Currently in Use")
	})

	it("renders all default models in the failover pool", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="google/gemma-4-31b-it:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		expect(screen.getByText("Google Gemma 4 31B (OpenRouter Free)")).toBeInTheDocument()
		expect(screen.getByText("Qwen 3.8 27B (OpenRouter Free)")).toBeInTheDocument()
		expect(screen.getByText("Cohere North Mini Code (OpenRouter Free)")).toBeInTheDocument()
		expect(screen.getByText("NVIDIA Nemotron 3 Ultra (OpenRouter Free)")).toBeInTheDocument()
		expect(screen.getByText("NVIDIA Nemotron 3 Nano Omni (OpenRouter Free)")).toBeInTheDocument()
		expect(screen.getByText("Z.ai GLM 5.2 (OpenRouter Free)")).toBeInTheDocument()
	})

	it("allows adding a custom free model to the pool", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="meta-llama/llama-3.3-70b-instruct:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		const customInput = screen.getByPlaceholderText(/provider\/model-id:free/)
		fireEvent.change(customInput, { target: { value: "meta-llama/llama-3.2-3b-instruct:free" } })

		const addButton = screen.getByText("Add Model")
		fireEvent.click(addButton)

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith(
			"freeRouterModels",
			expect.arrayContaining(["meta-llama/llama-3.2-3b-instruct:free"]),
		)
	})

	it("updates cooldown duration", () => {
		render(
			<FreeRouter
				apiConfiguration={defaultApiConfiguration}
				setApiConfigurationField={mockSetApiConfigurationField}
				selectedModelId="meta-llama/llama-3.3-70b-instruct:free"
				uriScheme="vscode"
				organizationAllowList={{ allowList: {}, providers: {} } as any}
			/>,
			{ wrapper: createWrapper() },
		)

		const cooldownInput = screen.getByDisplayValue("10")
		fireEvent.change(cooldownInput, { target: { value: "15" } })

		expect(mockSetApiConfigurationField).toHaveBeenCalledWith("freeRouterCooldownMinutes", 15)
	})
})
