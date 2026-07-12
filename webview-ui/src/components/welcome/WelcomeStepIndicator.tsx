import React from "react"

export interface Step {
	id: string
	label: string
}

interface WelcomeStepIndicatorProps {
	steps: Step[]
	currentStep: number
	className?: string
}

const WelcomeStepIndicator = ({ steps, currentStep, className = "" }: WelcomeStepIndicatorProps) => {
	return (
		<div
			className={`flex items-center justify-center gap-2 ${className}`}
			role="progressbar"
			aria-valuenow={currentStep + 1}
			aria-valuemin={1}
			aria-valuemax={steps.length}>
			{steps.map((step, index) => {
				const isCompleted = index < currentStep
				const isActive = index === currentStep

				return (
					<React.Fragment key={step.id}>
						{index > 0 && (
							<div
								className={`h-px w-8 transition-colors duration-300 ${
									isCompleted ? "bg-mirror-brand-via" : "bg-vscode-input-border"
								}`}
							/>
						)}
						<div className="flex items-center gap-1.5">
							<div
								className={`flex items-center justify-center size-6 rounded-full text-xs font-semibold transition-all duration-300 ${
									isCompleted
										? "bg-mirror-brand-via text-white"
										: isActive
											? "bg-mirror-brand-via/20 text-mirror-brand-via ring-1 ring-mirror-brand-via"
											: "bg-vscode-input-background text-vscode-descriptionForeground"
								}`}
								data-testid={`step-${step.id}-${isCompleted ? "completed" : isActive ? "active" : "pending"}`}>
								{isCompleted ? (
									<svg className="size-3" viewBox="0 0 12 12" fill="none">
										<path
											d="M2.5 6L5 8.5L9.5 3.5"
											stroke="currentColor"
											strokeWidth="2"
											strokeLinecap="round"
											strokeLinejoin="round"
										/>
									</svg>
								) : (
									index + 1
								)}
							</div>
							<span
								className={`text-xs transition-colors duration-300 hidden sm:inline ${
									isActive
										? "text-mirror-brand-via font-medium"
										: isCompleted
											? "text-vscode-foreground"
											: "text-vscode-descriptionForeground"
								}`}>
								{step.label}
							</span>
						</div>
					</React.Fragment>
				)
			})}
		</div>
	)
}

export default WelcomeStepIndicator
