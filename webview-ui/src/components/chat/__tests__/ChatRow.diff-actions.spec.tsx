import React from "react"
import { fireEvent, render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { MirrorMessage } from "@mirror-vs/types"
import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { ChatRowContent } from "../ChatRow"

const mockPostMessage = vi.fn()

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (...args: unknown[]) => mockPostMessage(...args),
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:fileOperations.wantsToEdit": "The assistant wants to edit this file",
				"chat:fileOperations.wantsToEditProtected": "The assistant wants to edit a protected file",
				"chat:fileOperations.wantsToEditOutsideWorkspace": "The assistant wants to edit outside workspace",
				"chat:fileOperations.wantsToApplyBatchChanges": "The assistant wants to apply batch changes",
			}
			return map[key] || key
		},
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock CodeBlock (avoid ESM/highlighter costs)
vi.mock("@src/components/common/CodeBlock", () => ({
	default: () => null,
}))

const queryClient = new QueryClient()

function createToolAskMessage(toolPayload: Record<string, unknown>): MirrorMessage {
	return {
		type: "ask",
		ask: "tool",
		ts: Date.now(),
		partial: false,
		text: JSON.stringify(toolPayload),
	}
}

function renderChatRow(message: MirrorMessage, isExpanded = false) {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatRowContent
					message={message}
					isExpanded={isExpanded}
					isLast={false}
					isStreaming={false}
					onToggleExpand={() => {}}
					onSuggestionClick={() => {}}
					onBatchFileResponse={() => {}}
					onFollowUpUnmount={() => {}}
					isFollowUpAnswered={false}
				/>
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatRow - inline diff stats and actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPostMessage.mockClear()
	})

	it("uses appliedDiff edit treatment (header/icon/diff stats)", () => {
		const diff = "@@ -1,1 +1,1 @@\n-old\n+new\n"
		const message = createToolAskMessage({
			tool: "appliedDiff",
			path: "src/file.ts",
			diff,
			diffStats: { added: 1, removed: 1 },
		})

		renderChatRow(message, false)

		expect(screen.getByText("Edited file.ts")).toBeInTheDocument()
		expect(screen.getByText("+1")).toBeInTheDocument()
		expect(screen.getByText("-1")).toBeInTheDocument()
	})

	it("uses same edit treatment for editedExistingFile", () => {
		const diff = "@@ -1,1 +1,1 @@\n-old\n+new\n"
		const message = createToolAskMessage({
			tool: "editedExistingFile",
			path: "src/file.ts",
			diff,
			diffStats: { added: 1, removed: 1 },
		})

		renderChatRow(message)

		expect(screen.getByText("Edited file.ts")).toBeInTheDocument()
		expect(screen.getByText("+1")).toBeInTheDocument()
		expect(screen.getByText("-1")).toBeInTheDocument()
	})

	it("uses same edit treatment for searchAndReplace", () => {
		const diff = "-a\n-b\n+c\n"
		const message = createToolAskMessage({
			tool: "searchAndReplace",
			path: "src/file.ts",
			diff,
			diffStats: { added: 1, removed: 2 },
		})

		renderChatRow(message)

		expect(screen.getByText("Edited file.ts")).toBeInTheDocument()
		expect(screen.getByText("+1")).toBeInTheDocument()
		expect(screen.getByText("-2")).toBeInTheDocument()
	})

	it("uses same edit treatment for newFileCreated", () => {
		const content = "a\nb\nc"
		const message = createToolAskMessage({
			tool: "newFileCreated",
			path: "src/new-file.ts",
			content,
			diffStats: { added: 3, removed: 0 },
		})

		renderChatRow(message)

		expect(screen.getByText("Edited new-file.ts")).toBeInTheDocument()
		expect(screen.getByText("+3")).toBeInTheDocument()
	})

	it("preserves click to open file affordance for edited file", () => {
		const message = createToolAskMessage({
			tool: "editedExistingFile",
			path: "src/new-file.ts",
			content: "+new file",
			diffStats: { added: 1, removed: 0 },
		})

		renderChatRow(message)
		const row = screen.getByText("Edited new-file.ts")
		fireEvent.click(row)

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "openFile",
			text: "src/new-file.ts",
		})
	})

	it("keeps batch diff handling for unified edit tools", () => {
		const message = createToolAskMessage({
			tool: "searchAndReplace",
			batchDiffs: [
				{
					path: "src/a.ts",
					changeCount: 1,
					key: "a",
					content: "@@ -1,1 +1,1 @@\n-a\n+b\n",
					diffStats: { added: 1, removed: 1 },
				},
			],
		})

		renderChatRow(message)

		expect(screen.getByText("Edited 1 file")).toBeInTheDocument()
	})
})
