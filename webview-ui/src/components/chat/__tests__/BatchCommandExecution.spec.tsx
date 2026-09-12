import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { BatchCommandExecution, type BatchCommandData } from "../BatchCommandExecution"

// Mock react-use
vi.mock("react-use", () => ({
	useEvent: vi.fn(),
}))

// Mock vscode
vi.mock("../../../utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock TerminalOutput
vi.mock("../TerminalOutput", () => ({
	TerminalOutput: ({ content }: { content: string }) => <div data-testid="terminal-output">{content}</div>,
}))

describe("BatchCommandExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders collapsible arrows for all commands in a batch, including those without output", () => {
		const batchCommands: BatchCommandData[] = [
			{
				executionId: "1",
				command: "mkdir test-dir",
				output: "",
				text: "mkdir test-dir",
				isAnswered: true,
				ts: 1000,
			},
			{
				executionId: "2",
				command: "echo 'hello world'",
				output: "hello world",
				text: "echo 'hello world'\nOutput:hello world",
				isAnswered: true,
				ts: 2000,
			},
		]

		const { container } = render(<BatchCommandExecution batchCommands={batchCommands} isLast={false} />)

		// Expand the outer ToolDisclosure first
		const disclosureHeader = screen.getByText("Ran 2 terminal commands")
		fireEvent.click(disclosureHeader)

		// Both commands should be visible
		expect(screen.getByText("mkdir test-dir")).toBeDefined()
		expect(screen.getByText("echo 'hello world'")).toBeDefined()

		// Outer ToolDisclosure has 1 chevron, plus 2 for the two batch commands
		const chevrons = container.querySelectorAll(".lucide-chevron-down")
		expect(chevrons.length).toBe(3)

		// Clicking the first command (empty output) expands and shows informative message
		const mkdirRow = screen.getByText("mkdir test-dir").closest("div[class*='cursor-pointer']")
		expect(mkdirRow).toBeDefined()
		fireEvent.click(mkdirRow!)

		expect(screen.getByText("Command completed with no output (exit code 0)")).toBeDefined()

		// Clicking the second command (with output) expands and shows the output
		const echoRow = screen.getByText("echo 'hello world'").closest("div[class*='cursor-pointer']")
		expect(echoRow).toBeDefined()
		fireEvent.click(echoRow!)

		expect(screen.getByTestId("terminal-output")).toBeDefined()
		expect(screen.getByText("hello world")).toBeDefined()
	})
})
