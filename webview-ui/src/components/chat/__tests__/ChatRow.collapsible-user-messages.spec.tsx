import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChatRowContent } from "../ChatRow"
import type { MirrorMessage } from "@mirror-vs/types"

// Mock vscode API
const mockPostMessage = vi.fn()
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (msg: unknown) => mockPostMessage(msg),
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { exists: () => true },
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock extension state context
vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		alwaysAllowMcp: false,
		currentCheckpoint: null,
		mode: "code",
		apiConfiguration: {},
		mirrorMessages: [],
		currentTaskItem: undefined,
	}),
}))

// Mock useSelectedModel hook
vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: () => ({ info: { supportsImages: true } }),
}))

const queryClient = new QueryClient()

function renderUserMessage(message: Partial<MirrorMessage>, isLast: boolean = false) {
	const defaultMessage: MirrorMessage = {
		ts: Date.now(),
		type: "say",
		say: "user_feedback",
		text: message.text,
		images: message.images,
		...message,
	}

	return render(
		<QueryClientProvider client={queryClient}>
			<ChatRowContent
				message={defaultMessage}
				isExpanded={false}
				isLast={isLast}
				isStreaming={false}
				onToggleExpand={() => {}}
			/>
		</QueryClientProvider>,
	)
}

describe("ChatRow - Collapsible user messages in history", () => {
	it("collapses long user messages in history and expands when 'Show more' is clicked", () => {
		const longText =
			"This is a long user feedback message.\nLine 2 with details.\nLine 3 with more instructions.\nLine 4 with additional explanation.\nLine 5 which exceeds four lines."

		renderUserMessage({ text: longText }, false)

		// Should show 'Show more' toggle button
		const showMoreBtn = screen.getByRole("button", { name: /show more/i })
		expect(showMoreBtn).toBeInTheDocument()

		// Clicking 'Show more' expands it and toggles button to 'Show less'
		fireEvent.click(showMoreBtn)
		expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument()

		// Clicking 'Show less' collapses it back
		fireEvent.click(screen.getByRole("button", { name: /show less/i }))
		expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument()
	})

	it("does not collapse short user messages in history", () => {
		const shortText = "Short prompt"
		renderUserMessage({ text: shortText }, false)

		expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument()
	})

	it("does not collapse user messages when isLast is true", () => {
		const longText =
			"This is a long user feedback message.\nLine 2 with details.\nLine 3 with more instructions.\nLine 4 with additional explanation.\nLine 5 which exceeds four lines."

		renderUserMessage({ text: longText }, true)

		expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument()
	})
})
