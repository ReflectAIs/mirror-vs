import React from "react"
import { FoldVertical, HardDriveDownload, HardDriveUpload, ListTodo } from "lucide-react"

import type { ModelActivity } from "@src/components/welcome/MirrorHero"
import MirrorHero from "@src/components/welcome/MirrorHero"
import { getCostBreakdownIfNeeded } from "@src/utils/costFormatting"
import { StandardTooltip, Button } from "@src/components/ui"
import { getModelMaxOutputTokens } from "@shared/api"
import { formatLargeNumber } from "@src/utils/format"
import { vscode } from "@src/utils/vscode"
import { ContextWindowProgress } from "./ContextWindowProgress"
import { TodoListDisplay } from "./TodoListDisplay"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatToolbarProps {
	task: any
	modelActivity: ModelActivity
	currentTaskItem: any
	apiMetrics: ReturnType<typeof import("@shared/getApiMetrics").getApiMetrics>
	aggregatedCostsMap: Map<string, { totalCost: number; ownCost: number; childrenCost: number }>
	activeHeaderPanel: "stats" | "todos" | "none"
	setActiveHeaderPanel: React.Dispatch<React.SetStateAction<"stats" | "todos" | "none">>
	latestTodos: any[] | undefined
	sendingDisabled: boolean
	modelId: string | undefined
	model: any
	apiConfiguration: any
	setShowRetiredProviderWarning: React.Dispatch<React.SetStateAction<boolean>>
	handleCondenseContext: (taskId: string) => void
	t: (key: string) => string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatToolbar = ({
	task,
	modelActivity,
	currentTaskItem,
	apiMetrics,
	aggregatedCostsMap,
	activeHeaderPanel,
	setActiveHeaderPanel,
	latestTodos,
	sendingDisabled,
	modelId,
	model,
	apiConfiguration,
	setShowRetiredProviderWarning,
	handleCondenseContext,
	t,
}: ChatToolbarProps) => {
	return (
		<>
			{/* Top Header Area */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-vscode-editorGroup-border/50 bg-vscode-sideBar-background/30 backdrop-blur-md shrink-0">
				<div className="flex items-center gap-2">
					<MirrorHero activity={modelActivity} size="small" />
					<div className="flex flex-col">
						<span className="font-bold text-sm tracking-wide bg-gradient-to-r from-mirror-brand-from via-mirror-brand-via to-mirror-brand-to bg-clip-text text-transparent">
							Mirror VS
						</span>
						<span className="text-[10px] text-vscode-descriptionForeground">AI Pair Programmer</span>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					{task && (
						<button
							onClick={() => setActiveHeaderPanel((prev) => (prev === "stats" ? "none" : "stats"))}
							className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-vscode-button-background/10 text-vscode-button-background hover:bg-vscode-button-background/20 transition-colors border border-vscode-button-background/20 cursor-pointer mr-1"
							title="View Session Statistics">
							<span>⚡</span>
							<span>
								$
								{(
									(currentTaskItem?.id && aggregatedCostsMap.has(currentTaskItem.id)
										? aggregatedCostsMap.get(currentTaskItem.id)!.totalCost
										: undefined) ?? apiMetrics.totalCost
								).toFixed(3)}
							</span>
						</button>
					)}
					<Button
						variant="ghost"
						className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
						onClick={() => setActiveHeaderPanel((prev) => (prev === "todos" ? "none" : "todos"))}
						title="View Task Todo List">
						<ListTodo className="size-3.5 text-vscode-descriptionForeground hover:text-vscode-foreground" />
					</Button>
					{currentTaskItem?.parentTaskId && (
						<Button
							variant="ghost"
							className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
							onClick={() =>
								vscode.postMessage({ type: "showTaskWithId", text: currentTaskItem.parentTaskId })
							}
							title="Back to Parent Task">
							<span className="codicon codicon-arrow-left text-xs flex items-center justify-center" />
						</Button>
					)}
					<Button
						variant="ghost"
						className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
						onClick={() => {
							setShowRetiredProviderWarning(false)
							vscode.postMessage({ type: "clearTask" })
						}}
						title="New Session">
						<span className="codicon codicon-add text-xs flex items-center justify-center" />
					</Button>
					<Button
						variant="ghost"
						className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
						onClick={() => vscode.postMessage({ type: "switchTab", tab: "history" })}
						title="Task History">
						<span className="codicon codicon-history text-xs flex items-center justify-center" />
					</Button>
					<Button
						variant="ghost"
						className="p-0 flex items-center justify-center h-6 w-6 hover:bg-vscode-list-hoverBackground"
						onClick={() => vscode.postMessage({ type: "switchTab", tab: "settings" })}
						title="Settings">
						<span className="codicon codicon-settings-gear text-xs flex items-center justify-center" />
					</Button>
				</div>
			</div>

			{activeHeaderPanel !== "none" && (
				<div className="shrink-0 border-b border-vscode-editorGroup-border/40 bg-vscode-sideBar-background px-4 py-3 flex flex-col gap-3.5 animate-in slide-in-from-top-2 duration-150">
					<div className="flex items-center justify-between border-b border-vscode-editorGroup-border/50 pb-1.5">
						<span className="font-bold text-[10px] uppercase tracking-wider text-vscode-descriptionForeground">
							{activeHeaderPanel === "stats" ? "Session Statistics" : "Active Todo List"}
						</span>
						<div className="flex items-center gap-2">
							{activeHeaderPanel === "stats" && task && (
								<button
									onClick={() => vscode.postMessage({ type: "exportCurrentTask" })}
									className="text-vscode-descriptionForeground hover:text-vscode-foreground cursor-pointer p-0.5 rounded bg-transparent border-none transition-colors"
									title="Export Session">
									<span className="codicon codicon-cloud-download text-xs flex items-center justify-center" />
								</button>
							)}
							<button
								onClick={() => setActiveHeaderPanel("none")}
								className="text-vscode-descriptionForeground hover:text-vscode-foreground cursor-pointer p-0.5 rounded bg-transparent border-none">
								<span className="codicon codicon-close text-[10px]" />
							</button>
						</div>
					</div>

					{activeHeaderPanel === "stats" ? (
						<div className="flex flex-col gap-3">
							{model?.contextWindow && model.contextWindow > 0 && (
								<div className="flex flex-col gap-1.5">
									<div className="flex justify-between text-[11px] text-vscode-descriptionForeground font-medium">
										<span>Context Window Limit</span>
										<span className="font-mono">
											{formatLargeNumber(apiMetrics.contextTokens || 0)} /{" "}
											{formatLargeNumber(model.contextWindow)}
										</span>
									</div>
									<div className="flex items-center gap-2">
										<div className="grow">
											<ContextWindowProgress
												contextWindow={model.contextWindow}
												contextTokens={apiMetrics.contextTokens || 0}
												maxTokens={
													model
														? getModelMaxOutputTokens({
																modelId: modelId ?? "",
																model,
																settings: apiConfiguration,
															})
														: 0
												}
											/>
										</div>
										<Button
											variant="ghost"
											className="p-1 h-auto hover:bg-vscode-list-hoverBackground text-vscode-descriptionForeground hover:text-vscode-foreground shrink-0"
											title={t("chat:task.condenseContext")}
											disabled={sendingDisabled}
											onClick={() => {
												if (currentTaskItem) {
													handleCondenseContext(currentTaskItem.id)
												}
												setActiveHeaderPanel("none")
											}}>
											<FoldVertical className="size-3.5" />
										</Button>
									</div>
								</div>
							)}

							<table className="w-full text-xs text-vscode-foreground border-collapse">
								<tbody>
									<tr className="border-b border-vscode-editorGroup-border/20">
										<th className="py-2 text-left font-medium text-vscode-descriptionForeground w-1/3">
											Tokens Used
										</th>
										<td className="py-2 text-right font-mono flex items-center justify-end gap-2.5">
											{apiMetrics.totalTokensIn > 0 && (
												<span>↑ {formatLargeNumber(apiMetrics.totalTokensIn)}</span>
											)}
											{apiMetrics.totalTokensOut > 0 && (
												<span>↓ {formatLargeNumber(apiMetrics.totalTokensOut)}</span>
											)}
										</td>
									</tr>

									{((apiMetrics.totalCacheReads || 0) > 0 ||
										(apiMetrics.totalCacheWrites || 0) > 0) && (
										<tr className="border-b border-vscode-editorGroup-border/20">
											<th className="py-2 text-left font-medium text-vscode-descriptionForeground">
												Cache Hits
											</th>
											<td className="py-2 text-right font-mono flex items-center justify-end gap-2.5">
												{(apiMetrics.totalCacheWrites || 0) > 0 && (
													<span className="flex items-center gap-1">
														<HardDriveDownload className="size-2.5" />
														{formatLargeNumber(apiMetrics.totalCacheWrites || 0)}
													</span>
												)}
												{(apiMetrics.totalCacheReads || 0) > 0 && (
													<span className="flex items-center gap-1">
														<HardDriveUpload className="size-2.5" />
														{formatLargeNumber(apiMetrics.totalCacheReads || 0)}
													</span>
												)}
											</td>
										</tr>
									)}

									<tr className="border-b border-vscode-editorGroup-border/20">
										<th className="py-2 text-left font-medium text-vscode-descriptionForeground">
											API Cost
										</th>
										<td className="py-2 text-right font-mono font-semibold">
											$
											{(
												(currentTaskItem?.id && aggregatedCostsMap.has(currentTaskItem.id)
													? aggregatedCostsMap.get(currentTaskItem.id)!.totalCost
													: undefined) ?? apiMetrics.totalCost
											).toFixed(4)}
										</td>
									</tr>

									{currentTaskItem?.id && aggregatedCostsMap.has(currentTaskItem.id) && (
										<tr>
											<th className="py-2 text-left font-medium text-vscode-descriptionForeground">
												Cost Breakdown
											</th>
											<td className="py-2 text-right font-mono text-[10px] text-vscode-descriptionForeground whitespace-pre-wrap">
												{getCostBreakdownIfNeeded(aggregatedCostsMap.get(currentTaskItem.id)!, {
													own: t("common:costs.own"),
													subtasks: t("common:costs.subtasks"),
												})}
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					) : (
						<div className="max-h-48 overflow-y-auto pr-1">
							{latestTodos && latestTodos.length > 0 ? (
								<TodoListDisplay todos={latestTodos} defaultExpanded={true} />
							) : (
								<div className="text-xs text-vscode-descriptionForeground py-4 text-center">
									No active todos found for this session.
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</>
	)
}

export default ChatToolbar
