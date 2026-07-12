// npm run test ContextWindowProgress.spec.tsx

import React from "react"
import { render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ContextWindowProgress } from "@src/components/chat/ContextWindowProgress"

// Mock formatLargeNumber function
vi.mock("@/utils/format", () => ({
	formatLargeNumber: vi.fn((num) => num.toString()),
}))

// Mock VSCodeBadge component for all tests
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: ({ children }: { children: React.ReactNode }) => <div data-testid="vscode-badge">{children}</div>,
}))

// Mock useSelectedModel hook
vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: vi.fn(() => ({
		id: "test",
		info: { contextWindow: 4000 },
	})),
}))

describe("ContextWindowProgress", () => {
	const queryClient = new QueryClient()

	const renderComponent = (props: { contextWindow: number; contextTokens: number; maxTokens?: number }) => {
		return render(
			<QueryClientProvider client={queryClient}>
				<ContextWindowProgress {...props} />
			</QueryClientProvider>,
		)
	}

	beforeEach(() => vi.clearAllMocks())

	it("renders correctly with valid inputs", () => {
		renderComponent({ contextTokens: 1000, contextWindow: 4000 })

		expect(screen.getByTestId("context-tokens-count")).toBeInTheDocument()
		expect(screen.getByTestId("context-tokens-count")).toHaveTextContent("1000")
		expect(screen.getByTestId("context-window-size")).toHaveTextContent("4000")
	})

	it("handles zero context window gracefully", () => {
		renderComponent({ contextTokens: 0, contextWindow: 0 })

		expect(screen.getByTestId("context-tokens-count")).toBeInTheDocument()
		expect(screen.getByTestId("context-tokens-count")).toHaveTextContent("0")
	})

	it("handles edge cases with negative values", () => {
		renderComponent({ contextTokens: -100, contextWindow: 4000 })

		expect(screen.getByTestId("context-tokens-count")).toHaveTextContent("0")
		expect(screen.getByTestId("context-window-size")).toHaveTextContent("4000")
	})

	it("calculates percentages correctly", () => {
		renderComponent({ contextTokens: 1000, contextWindow: 4000 })

		const tokenCount = screen.getByTestId("context-tokens-count")
		const windowSize = screen.getByTestId("context-window-size")

		expect(tokenCount).toBeInTheDocument()
		expect(tokenCount).toHaveTextContent("1000")

		expect(windowSize).toBeInTheDocument()
		expect(windowSize).toHaveTextContent("4000")

		const progressBarContainer = screen.getByTestId("context-tokens-count").parentElement
		expect(progressBarContainer).toBeInTheDocument()
		expect(progressBarContainer?.querySelector(".flex-1.relative")).toBeInTheDocument()
	})
})
