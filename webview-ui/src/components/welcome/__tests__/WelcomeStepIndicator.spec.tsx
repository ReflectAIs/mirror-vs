// npx vitest src/components/welcome/__tests__/WelcomeStepIndicator.spec.tsx

import { render, screen } from "@/utils/test-utils"
import WelcomeStepIndicator from "../WelcomeStepIndicator"

const STEPS = [
	{ id: "welcome", label: "Welcome" },
	{ id: "provider", label: "Connect Provider" },
	{ id: "complete", label: "Ready" },
]

describe("WelcomeStepIndicator", () => {
	it("renders all step labels", () => {
		render(<WelcomeStepIndicator steps={STEPS} currentStep={0} />)

		expect(screen.getByText("Welcome")).toBeInTheDocument()
		expect(screen.getByText("Connect Provider")).toBeInTheDocument()
		expect(screen.getByText("Ready")).toBeInTheDocument()
	})

	it("marks the first step as active when currentStep is 0", () => {
		render(<WelcomeStepIndicator steps={STEPS} currentStep={0} />)

		expect(screen.getByTestId("step-welcome-active")).toBeInTheDocument()
		expect(screen.getByTestId("step-provider-pending")).toBeInTheDocument()
		expect(screen.getByTestId("step-complete-pending")).toBeInTheDocument()
	})

	it("marks completed steps with checkmarks", () => {
		render(<WelcomeStepIndicator steps={STEPS} currentStep={1} />)

		expect(screen.getByTestId("step-welcome-completed")).toBeInTheDocument()
		expect(screen.getByTestId("step-provider-active")).toBeInTheDocument()
		expect(screen.getByTestId("step-complete-pending")).toBeInTheDocument()
	})

	it("marks all steps completed when on the last step", () => {
		render(<WelcomeStepIndicator steps={STEPS} currentStep={2} />)

		expect(screen.getByTestId("step-welcome-completed")).toBeInTheDocument()
		expect(screen.getByTestId("step-provider-completed")).toBeInTheDocument()
		expect(screen.getByTestId("step-complete-active")).toBeInTheDocument()
	})

	it("sets appropriate aria attributes for accessibility", () => {
		render(<WelcomeStepIndicator steps={STEPS} currentStep={2} />)

		const progressbar = screen.getByRole("progressbar")
		expect(progressbar).toHaveAttribute("aria-valuenow", "3")
		expect(progressbar).toHaveAttribute("aria-valuemin", "1")
		expect(progressbar).toHaveAttribute("aria-valuemax", "3")
	})

	it("applies custom className", () => {
		const { container } = render(<WelcomeStepIndicator steps={STEPS} currentStep={0} className="my-custom-class" />)

		expect(container.firstChild).toHaveClass("my-custom-class")
	})
})
