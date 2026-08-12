import { render, screen, fireEvent } from "@/utils/test-utils"

import SessionGroupItem from "../SessionGroupItem"
import type { SessionGroup, DisplayHistoryItem } from "../types"

vi.mock("@src/utils/vscode")
vi.mock("@/utils/format", () => ({
	formatTimeAgo: vi.fn(() => "2 hours ago"),
}))

const createMockDisplayItem = (overrides: Partial<DisplayHistoryItem> = {}): DisplayHistoryItem => ({
	id: "task-1",
	number: 1,
	task: "Test task",
	ts: Date.now(),
	tokensIn: 100,
	tokensOut: 50,
	totalCost: 0.01,
	workspace: "/workspace/project",
	...overrides,
})

const createMockSession = (overrides: Partial<SessionGroup> = {}): SessionGroup => ({
	sessionId: "session-1",
	sessionName: "Session 1",
	tabs: [],
	taskCount: 0,
	newestTs: Date.now(),
	isExpanded: false,
	...overrides,
})

describe("SessionGroupItem", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("session header rendering", () => {
		it("renders session name and test id", () => {
			const session = createMockSession({
				sessionId: "my-session",
				sessionName: "My Session",
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByTestId("session-group-my-session")).toBeInTheDocument()
			expect(screen.getByText("My Session")).toBeInTheDocument()
		})

		it("shows tab count in header", () => {
			const tabs = [
				createMockDisplayItem({ id: "tab-1", task: "Tab 1" }),
				createMockDisplayItem({ id: "tab-2", task: "Tab 2" }),
			]
			const session = createMockSession({
				tabs,
				taskCount: 2,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByText("2 tabs")).toBeInTheDocument()
		})

		it("shows singular tab label for single tab", () => {
			const session = createMockSession({
				tabs: [createMockDisplayItem({ id: "tab-1" })],
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByText("1 tab")).toBeInTheDocument()
		})
	})

	describe("expand/collapse behavior", () => {
		it("calls onToggleExpand when header is clicked", () => {
			const onToggleExpand = vi.fn()
			const session = createMockSession()

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={onToggleExpand}
					onRenameSession={vi.fn()}
				/>,
			)

			const header = screen.getByRole("button", { name: /Session 1/i })
			fireEvent.click(header)

			expect(onToggleExpand).toHaveBeenCalledTimes(1)
		})

		it("shows tabs when expanded", () => {
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Visible tab content" })]
			const session = createMockSession({
				isExpanded: true,
				tabs,
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByTestId("session-tab-list")).toBeInTheDocument()
			expect(screen.getByText("Visible tab content")).toBeInTheDocument()
		})

		it("hides tabs when collapsed using max-h-0", () => {
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Hidden tab" })]
			const session = createMockSession({
				isExpanded: false,
				tabs,
				taskCount: 1,
			})

			const { container } = render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			const tabList = screen.getByTestId("session-tab-list")
			expect(tabList).toHaveClass("max-h-0")
		})
	})

	describe("inline rename", () => {
		it("shows input field on double-click", () => {
			const session = createMockSession({ sessionName: "Original Name" })

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			const nameSpan = screen.getByText("Original Name")
			fireEvent.doubleClick(nameSpan)

			const input = screen.getByRole("textbox")
			expect(input).toBeInTheDocument()
			expect(input).toHaveValue("Original Name")
		})

		it("calls onRenameSession with trimmed value on Enter", () => {
			const onRenameSession = vi.fn()
			const session = createMockSession({ sessionName: "Old Name" })

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={onRenameSession}
				/>,
			)

			fireEvent.doubleClick(screen.getByText("Old Name"))
			const input = screen.getByRole("textbox")
			fireEvent.change(input, { target: { value: "New Name" } })
			fireEvent.keyDown(input, { key: "Enter" })

			expect(onRenameSession).toHaveBeenCalledWith("New Name")
		})

		it("reverts name on Escape", () => {
			const session = createMockSession({ sessionName: "Original" })

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			fireEvent.doubleClick(screen.getByText("Original"))
			const input = screen.getByRole("textbox")
			fireEvent.change(input, { target: { value: "Changed" } })
			fireEvent.keyDown(input, { key: "Escape" })

			// Should revert to original name
			expect(screen.getByText("Original")).toBeInTheDocument()
		})

		it("does not call onRenameSession on blur with unchanged value", () => {
			const onRenameSession = vi.fn()
			const session = createMockSession({ sessionName: "Same Name" })

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={onRenameSession}
				/>,
			)

			fireEvent.doubleClick(screen.getByText("Same Name"))
			const input = screen.getByRole("textbox")
			fireEvent.blur(input)

			expect(onRenameSession).not.toHaveBeenCalled()
		})
	})

	describe("selection mode", () => {
		it("renders checkboxes in selection mode", () => {
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Selectable tab" })]
			const session = createMockSession({
				isExpanded: true,
				tabs,
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					isSelectionMode={true}
					selectedTaskIds={new Set()}
					onToggleSelection={vi.fn()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			const checkboxes = screen.getAllByRole("checkbox")
			expect(checkboxes.length).toBeGreaterThanOrEqual(1)
		})
	})

	describe("delete handling", () => {
		it("passes onDelete to TaskItem", () => {
			const onDelete = vi.fn()
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Deletable tab" })]
			const session = createMockSession({
				isExpanded: true,
				tabs,
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onDelete={onDelete}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			const deleteButton = screen.getByTestId("delete-task-button")
			fireEvent.click(deleteButton)

			expect(onDelete).toHaveBeenCalledWith("tab-1")
		})
	})

	describe("custom className", () => {
		it("applies custom className to container", () => {
			const session = createMockSession({ sessionId: "custom-class-session" })

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					className="custom-class"
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			const container = screen.getByTestId("session-group-custom-class-session")
			expect(container).toHaveClass("custom-class")
		})
	})

	describe("variant handling", () => {
		it("renders with full variant", () => {
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Full variant tab" })]
			const session = createMockSession({
				isExpanded: true,
				tabs,
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="full"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByText("Full variant tab")).toBeInTheDocument()
		})

		it("renders with compact variant", () => {
			const tabs = [createMockDisplayItem({ id: "tab-1", task: "Compact variant tab" })]
			const session = createMockSession({
				isExpanded: true,
				tabs,
				taskCount: 1,
			})

			render(
				<SessionGroupItem
					session={session}
					variant="compact"
					selectedTaskIds={new Set()}
					onToggleExpand={vi.fn()}
					onRenameSession={vi.fn()}
				/>,
			)

			expect(screen.getByText("Compact variant tab")).toBeInTheDocument()
		})
	})
})
