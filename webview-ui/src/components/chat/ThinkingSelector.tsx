import React, { useCallback } from "react"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { vscode } from "../../utils/vscode"
import { ReasoningEffort } from "@mirror-vs/types"
import { StandardTooltip } from "../ui/standard-tooltip"
import { Brain } from "lucide-react"

interface ThinkingSelectorProps {
	className?: string
}

export const ThinkingSelector: React.FC<ThinkingSelectorProps> = ({ className }) => {
	const { apiConfiguration, setApiConfiguration } = useExtensionState()
	const rawEffort = apiConfiguration?.reasoningEffort
	const currentEffort: ReasoningEffort =
		rawEffort === "low" || rawEffort === "high" || rawEffort === "medium"
			? (rawEffort as ReasoningEffort)
			: "medium"

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLSelectElement>) => {
			const value = e.target.value as ReasoningEffort
			const updatedConfig = {
				...apiConfiguration,
				reasoningEffort: value,
				enableReasoningEffort: true,
			}
			setApiConfiguration(updatedConfig)
			vscode.postMessage({
				type: "modelChange",
				apiConfiguration: updatedConfig,
			})
		},
		[apiConfiguration, setApiConfiguration],
	)

	const getTooltipText = (effort: ReasoningEffort) => {
		switch (effort) {
			case "low":
				return "Low Thinking Mode: Minimum thinking tokens for fast, simple edits"
			case "high":
				return "High Thinking Mode: Deep reasoning for complex architectural tasks"
			case "medium":
			default:
				return "Medium Thinking Mode: Standard reasoning depth for general coding"
		}
	}

	return (
		<StandardTooltip content={getTooltipText(currentEffort)}>
			<div className={`relative flex items-center ${className || ""}`}>
				<Brain className="w-3 h-3 absolute left-1.5 text-vscode-descriptionForeground pointer-events-none z-10" />
				<select
					data-testid="thinking-selector"
					value={currentEffort}
					onChange={handleChange}
					aria-label="Thinking Mode Selector"
					className="min-w-0 h-6 pl-5 pr-5 text-[11px] bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-[rgba(255,255,255,0.12)] rounded focus:outline-none focus:border-mirror-brand-via cursor-pointer appearance-none"
					style={{
						backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
						backgroundPosition: "right 4px center",
						backgroundRepeat: "no-repeat",
						backgroundSize: "14px 14px",
					}}>
					<option key="low" value="low" className="bg-vscode-dropdown-background text-vscode-dropdown-foreground">
						Low
					</option>
					<option key="medium" value="medium" className="bg-vscode-dropdown-background text-vscode-dropdown-foreground">
						Medium
					</option>
					<option key="high" value="high" className="bg-vscode-dropdown-background text-vscode-dropdown-foreground">
						High
					</option>
				</select>
			</div>
		</StandardTooltip>
	)
}
