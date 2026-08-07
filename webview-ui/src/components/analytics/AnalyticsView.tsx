import { ArrowLeft, TrendingUp, BarChart2, DollarSign, Cpu } from "lucide-react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { formatLargeNumber } from "@src/utils/format"

interface AnalyticsViewProps {
	onDone: () => void
}

export default function AnalyticsView({ onDone }: AnalyticsViewProps) {
	const { taskHistory = [] } = useExtensionState()

	// Calculate statistics
	const totalTasks = taskHistory.length
	const totalSpent = taskHistory.reduce((acc, item) => acc + (item.totalCost || 0), 0)
	const totalTokensIn = taskHistory.reduce((acc, item) => acc + (item.tokensIn || 0), 0)
	const totalTokensOut = taskHistory.reduce((acc, item) => acc + (item.tokensOut || 0), 0)
	const totalTokens = totalTokensIn + totalTokensOut

	// Group by mode / profile
	const modelStats = taskHistory.reduce(
		(acc, item) => {
			const model = item.mode || item.apiConfigName || "default"
			if (!acc[model]) {
				acc[model] = { count: 0, cost: 0, tokens: 0 }
			}
			acc[model].count++
			acc[model].cost += item.totalCost || 0
			acc[model].tokens += (item.tokensIn || 0) + (item.tokensOut || 0)
			return acc
		},
		{} as Record<string, { count: number; cost: number; tokens: number }>,
	)

	const modelStatsArray = Object.entries(modelStats).sort((a, b) => b[1].cost - a[1].cost)

	return (
		<div className="flex flex-col h-full bg-vscode-sideBar-background text-vscode-foreground select-none">
			{/* Header */}
			<div className="flex items-center gap-2.5 px-4 py-3 border-b border-vscode-panel-border shrink-0">
				<button
					onClick={onDone}
					className="p-1 rounded hover:bg-vscode-toolbar-hoverBackground text-vscode-foreground shrink-0 cursor-pointer"
					title="Back to Chat">
					<ArrowLeft className="w-4 h-4" />
				</button>
				<div className="flex items-center gap-2">
					<BarChart2 className="w-4 h-4 text-emerald-400" />
					<span className="font-bold text-sm tracking-wide">Session Analytics</span>
				</div>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
				{/* Top Metrics Cards */}
				<div className="grid grid-cols-2 gap-3">
					<div className="p-3.5 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border shadow-sm flex items-start gap-3">
						<div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
							<DollarSign className="w-4 h-4" />
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-[10px] text-vscode-descriptionForeground font-bold uppercase tracking-wider">
								Total Cost
							</span>
							<span className="text-base font-bold text-emerald-300 mt-0.5">
								${totalSpent.toFixed(4)}
							</span>
						</div>
					</div>

					<div className="p-3.5 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border shadow-sm flex items-start gap-3">
						<div className="p-2 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400">
							<Cpu className="w-4 h-4" />
						</div>
						<div className="flex flex-col min-w-0">
							<span className="text-[10px] text-vscode-descriptionForeground font-bold uppercase tracking-wider">
								Total Tokens
							</span>
							<span className="text-base font-bold text-blue-300 mt-0.5">
								{formatLargeNumber(totalTokens)}
							</span>
						</div>
					</div>
				</div>

				{/* Tasks Summary */}
				<div className="p-3.5 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border shadow-sm flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="p-2 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400">
							<TrendingUp className="w-4 h-4" />
						</div>
						<div className="flex flex-col">
							<span className="text-[10px] text-vscode-descriptionForeground font-bold uppercase tracking-wider">
								Total Tasks
							</span>
							<span className="text-sm font-bold text-purple-300 mt-0.5">
								{totalTasks} Completed Tasks
							</span>
						</div>
					</div>
				</div>

				{/* Token Distribution (Ratio Bar) */}
				{totalTokens > 0 && (
					<div className="p-3.5 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border shadow-sm flex flex-col gap-2">
						<span className="text-[10px] text-vscode-descriptionForeground font-bold uppercase tracking-wider">
							Token Ratio (Input vs Output)
						</span>
						<div className="w-full h-3 rounded-full bg-vscode-panel-border overflow-hidden flex">
							<div
								className="h-full bg-blue-500"
								style={{ width: `${(totalTokensIn / totalTokens) * 100}%` }}
								title={`Input (Prompt) Tokens: ${formatLargeNumber(totalTokensIn)}`}
							/>
							<div
								className="h-full bg-purple-500"
								style={{ width: `${(totalTokensOut / totalTokens) * 100}%` }}
								title={`Output (Completion) Tokens: ${formatLargeNumber(totalTokensOut)}`}
							/>
						</div>
						<div className="flex justify-between items-center text-[10px] text-vscode-descriptionForeground font-mono">
							<span className="flex items-center gap-1.5">
								<span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
								Input: {((totalTokensIn / totalTokens) * 100).toFixed(0)}%
							</span>
							<span className="flex items-center gap-1.5">
								<span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
								Output: {((totalTokensOut / totalTokens) * 100).toFixed(0)}%
							</span>
						</div>
					</div>
				)}

				{/* Model Spending breakdown */}
				<div className="flex flex-col gap-2">
					<span className="text-[10px] text-vscode-descriptionForeground font-bold uppercase tracking-wider px-1">
						Cost Distribution by Model
					</span>

					{modelStatsArray.length === 0 ? (
						<div className="p-6 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border text-center text-xs text-vscode-descriptionForeground">
							No data available yet. Start a task to view statistics.
						</div>
					) : (
						<div className="flex flex-col gap-2">
							{modelStatsArray.map(([modelName, stats]) => {
								const percentage = totalSpent > 0 ? (stats.cost / totalSpent) * 100 : 0
								return (
									<div
										key={modelName}
										className="p-3 rounded-lg bg-vscode-sideBarSticky-background border border-vscode-panel-border flex flex-col gap-2 shadow-sm">
										<div className="flex justify-between items-start gap-2">
											<span
												className="text-xs font-semibold text-vscode-foreground truncate flex-1"
												title={modelName}>
												{modelName.split("/").pop()}
											</span>
											<span className="text-xs font-bold text-emerald-300 shrink-0">
												${stats.cost.toFixed(4)}
											</span>
										</div>

										{/* Progress/Percentage Bar */}
										<div className="w-full h-1.5 rounded-full bg-vscode-panel-border overflow-hidden">
											<div
												className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
												style={{ width: `${percentage}%` }}
											/>
										</div>

										<div className="flex justify-between items-center text-[10px] text-vscode-descriptionForeground font-mono">
											<span>{stats.count} requests</span>
											<span>{formatLargeNumber(stats.tokens)} tokens</span>
										</div>
									</div>
								)
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	)
}
