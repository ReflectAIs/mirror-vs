import React from "react"
import { render, screen } from "@/utils/test-utils"
import { ImageProgressRow } from "../ImageProgressRow"
import { describe, it, expect, vi } from "vitest"

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
	Sparkles: () => <svg data-testid="icon-sparkles" />,
	ImageIcon: () => <svg data-testid="icon-image" />,
	LoaderCircle: () => <svg data-testid="icon-loader" />,
}))

// Mock CircularProgress
vi.mock("../../ui/circular-progress", () => ({
	CircularProgress: ({ percentage, size, className }: any) => (
		<div data-testid="circular-progress" data-percentage={percentage} data-size={size} className={className} />
	),
}))

// Mock cn utility
vi.mock("@/lib/utils", () => ({
	cn: (...classes: any[]) => classes.filter(Boolean).join(" "),
}))

describe("ImageProgressRow", () => {
	it("should return null when no text is provided", () => {
		const { container } = render(<ImageProgressRow text={undefined} />)
		expect(container.innerHTML).toBe("")
	})

	it("should return null when text is invalid JSON", () => {
		const { container } = render(<ImageProgressRow text="not valid json" />)
		expect(container.innerHTML).toBe("")
	})

	it("should return null when text is empty string", () => {
		const { container } = render(<ImageProgressRow text="" />)
		expect(container.innerHTML).toBe("")
	})

	it("should render progress data correctly", () => {
		const data = {
			stage: "sampling",
			progress: 45,
			value: 9,
			max: 20,
			state: "running",
			eta: 15,
			currentNode: "KSampler",
		}

		render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Stage label
		expect(screen.getByText("sampling")).toBeInTheDocument()

		// Progress percentage
		expect(screen.getByText("45%")).toBeInTheDocument()

		// Step info
		expect(screen.getByText("9/20 steps")).toBeInTheDocument()

		// ETA
		expect(screen.getByText("~15s")).toBeInTheDocument()

		// Current node
		expect(screen.getByText("KSampler")).toBeInTheDocument()
	})

	it("should show running state with pulse animation", () => {
		const data = {
			stage: "generating",
			progress: 30,
			state: "running",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Check that the pulse animation class is applied
		const pulseDiv = container.querySelector(".animate-pulse")
		expect(pulseDiv).toBeTruthy()

		// Should show ImageIcon for running state
		expect(screen.getByTestId("icon-image")).toBeInTheDocument()
	})

	it("should show preparing state with pulse animation", () => {
		const data = {
			stage: "preparing",
			progress: 10,
			state: "preparing",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} />)

		const pulseDiv = container.querySelector(".animate-pulse")
		expect(pulseDiv).toBeTruthy()
	})

	it("should show completed state with Sparkles icon", () => {
		const data = {
			stage: "completed",
			progress: 100,
			state: "completed",
		}

		render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Should show Sparkles icon for completed state
		expect(screen.getByTestId("icon-sparkles")).toBeInTheDocument()
		// No pulse animation when complete
	})

	it("should show failed state with error styling", () => {
		const data = {
			stage: "failed",
			progress: 50,
			state: "failed",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Should show LoaderCircle icon for failed state
		expect(screen.getByTestId("icon-loader")).toBeInTheDocument()

		// Circular progress should have error foreground color
		const progress = screen.getByTestId("circular-progress")
		expect(progress.className).toContain("text-vscode-errorForeground")
	})

	it("should show partial state with pulse animation when partial=true", () => {
		const data = {
			stage: "loading",
			progress: 20,
			state: "idle",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} partial={true} />)

		const pulseDiv = container.querySelector(".animate-pulse")
		expect(pulseDiv).toBeTruthy()
	})

	it("should use default stage label when stage is missing", () => {
		const data = {
			progress: 60,
			state: "running",
		}

		render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Should default to "generating"
		expect(screen.getByText("generating")).toBeInTheDocument()
	})

	it("should handle partial progress without step/eta info", () => {
		const data = {
			stage: "downloading",
			progress: 75,
			state: "running",
		}

		render(<ImageProgressRow text={JSON.stringify(data)} />)

		expect(screen.getByText("downloading")).toBeInTheDocument()
		expect(screen.getByText("75%")).toBeInTheDocument()
		// No step or eta info should be shown
		expect(screen.queryByText(/steps/)).not.toBeInTheDocument()
		expect(screen.queryByText(/~.*s/)).not.toBeInTheDocument()
	})

	it("should clamp progress over 100 to 100", () => {
		const data = {
			stage: "over",
			progress: 150,
			state: "running",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} />)

		// Should clamp to 100%
		const progress = container.querySelector("[data-testid='circular-progress']")
		expect(progress?.getAttribute("data-percentage")).toBe("100")
	})

	it("should clamp progress below 0 to 0", () => {
		const data = {
			stage: "under",
			progress: -10,
			state: "running",
		}

		const { container } = render(<ImageProgressRow text={JSON.stringify(data)} />)
		const progress = container.querySelector("[data-testid='circular-progress']")
		expect(progress?.getAttribute("data-percentage")).toBe("0")
	})
})
