import { render, screen } from "@/utils/test-utils"

import type { HistoryItem } from "@mirror-vs/types"

import HistoryPreview from "../HistoryPreview"

vi.mock("../useTaskSearch")

import { useTaskSearch } from "../useTaskSearch"

vi.mock("@src/utils/vscode")

const mockUseTaskSearch = useTaskSearch as any

const mockTasks: HistoryItem[] = [
	{
		id: "task-1",
		number: 1,
		task: "First task",
		ts: 600,
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.01,
	},
	{
		id: "task-2",
		number: 2,
		task: "Second task",
		ts: 500,
		tokensIn: 200,
		tokensOut: 100,
		totalCost: 0.02,
	},
	{
		id: "task-3",
		number: 3,
		task: "Third task",
		ts: 400,
		tokensIn: 150,
		tokensOut: 75,
		totalCost: 0.015,
	},
	{
		id: "task-4",
		number: 4,
		task: "Fourth task",
		ts: 300,
		tokensIn: 300,
		tokensOut: 150,
		totalCost: 0.03,
	},
	{
		id: "task-5",
		number: 5,
		task: "Fifth task",
		ts: 200,
		tokensIn: 250,
		tokensOut: 125,
		totalCost: 0.025,
	},
	{
		id: "task-6",
		number: 6,
		task: "Sixth task",
		ts: 100,
		tokensIn: 400,
		tokensOut: 200,
		totalCost: 0.04,
	},
]

describe("HistoryPreview", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders nothing when no tasks are available", () => {
		mockUseTaskSearch.mockReturnValue({
			tasks: [],
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		const { container } = render(<HistoryPreview />)

		// Should render the container but no task items
		expect(container.firstChild).toHaveClass("flex", "flex-col", "gap-1")
		expect(screen.queryByTestId(/task-item-/)).not.toBeInTheDocument()
	})

	it("renders up to 4 tasks when tasks are available", () => {
		mockUseTaskSearch.mockReturnValue({
			tasks: mockTasks,
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		render(<HistoryPreview />)

		// Should render only the first 4 tasks
		expect(screen.getByTestId("task-item-task-1")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-task-2")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-task-3")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-task-4")).toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-5")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-6")).not.toBeInTheDocument()
	})

	it("renders all tasks when there are 4 or fewer", () => {
		const threeTasks = mockTasks.slice(0, 3)
		mockUseTaskSearch.mockReturnValue({
			tasks: threeTasks,
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		render(<HistoryPreview />)

		expect(screen.getByTestId("task-item-task-1")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-task-2")).toBeInTheDocument()
		expect(screen.getByTestId("task-item-task-3")).toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-4")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-5")).not.toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-6")).not.toBeInTheDocument()
	})

	it("renders only 1 task when there is only 1 task", () => {
		const oneTask = mockTasks.slice(0, 1)
		mockUseTaskSearch.mockReturnValue({
			tasks: oneTask,
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		render(<HistoryPreview />)

		expect(screen.getByTestId("task-item-task-1")).toBeInTheDocument()
		expect(screen.queryByTestId("task-item-task-2")).not.toBeInTheDocument()
	})

	it("displays the header and view all button", () => {
		mockUseTaskSearch.mockReturnValue({
			tasks: mockTasks,
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		render(<HistoryPreview />)

		// Should show header and view all button
		expect(screen.getByText("history:recentTasks")).toBeInTheDocument()
		expect(screen.getByText("history:viewAllHistory")).toBeInTheDocument()
	})

	it("renders TaskItem with compact variant", () => {
		const oneTask = mockTasks.slice(0, 1)
		mockUseTaskSearch.mockReturnValue({
			tasks: oneTask,
			searchQuery: "",
			setSearchQuery: vi.fn(),
			sortOption: "newest",
			setSortOption: vi.fn(),
			lastNonRelevantSort: null,
			setLastNonRelevantSort: vi.fn(),
			showAllWorkspaces: false,
			setShowAllWorkspaces: vi.fn(),
		})

		render(<HistoryPreview />)

		// TaskItem rendered with compact variant
		const taskItem = screen.getByTestId("task-item-task-1")
		expect(taskItem).toBeInTheDocument()
		expect(screen.getByText("First task")).toBeInTheDocument()
	})
})
