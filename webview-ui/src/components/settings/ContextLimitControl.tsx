import React from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Slider } from "@/components/ui"

interface ContextLimitControlProps {
	value: number | undefined
	onChange: (value: number | undefined) => void
	maxLimit?: number
}

export const ContextLimitControl = ({ value, onChange, maxLimit = 1000000 }: ContextLimitControlProps) => {
	const { t } = useAppTranslation()
	const defaultValue = 128000
	const currentValue = value !== undefined ? value : defaultValue

	const handleTextChange = (e: any) => {
		const val = parseInt(e.target.value, 10)
		if (!isNaN(val) && val >= 1000) {
			onChange(val)
		}
	}

	const handleSliderChange = (vals: number[]) => {
		onChange(vals[0])
	}

	const handleReset = () => {
		onChange(defaultValue)
	}

	// Calculate a friendly display string (e.g. 128k)
	const formatTokens = (tokens: number) => {
		if (tokens >= 1000) {
			return `${Math.round(tokens / 1000)}k`
		}
		return `${tokens}`
	}

	return (
		<div className="flex flex-col gap-1.5 mt-3 border-t border-vscode-panel-border/30 pt-3">
			<div className="flex items-center justify-between">
				<label className="block font-medium text-xs text-vscode-foreground">Custom Context Limit</label>
				<VSCodeButton appearance="icon" className="text-[10px] h-6" onClick={handleReset}>
					Reset to Default (128k)
				</VSCodeButton>
			</div>
			<div className="flex items-center gap-3">
				<div className="flex-1 flex items-center gap-2">
					<Slider
						value={[currentValue]}
						min={4000}
						max={maxLimit}
						step={1000}
						onValueChange={handleSliderChange}
						className="flex-1"
					/>
					<span className="text-[11px] font-mono text-vscode-descriptionForeground shrink-0 min-w-10 text-right">
						{formatTokens(currentValue)}
					</span>
				</div>
				<VSCodeTextField value={String(currentValue)} onInput={handleTextChange} className="w-24 shrink-0" />
			</div>
			<div className="text-[10px] text-vscode-descriptionForeground mt-0.5">
				Overrides maximum input context window size (in tokens) for this model profile. Default is 128,000.
			</div>
		</div>
	)
}
