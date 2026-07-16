import React, { useState, useEffect, useCallback, useMemo } from "react"
import { Trans } from "react-i18next"
import { Upload, Globe, Folder, Trash2, Star, Package } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	StandardTooltip,
	Textarea,
} from "@/components/ui"
import { vscode } from "@/utils/vscode"
import { SectionHeader } from "./SectionHeader"

/** Pipeline summary sent from the backend. */
interface PipelineSummary {
	slug: string
	name: string
	description: string
	type: string
	tags: string[]
	source: "builtin" | "global" | "project"
	isDefault: boolean
}

const typeLabels: Record<string, string> = {
	generate: "Generate (txt2img)",
	edit: "Edit (img2img)",
	inpaint: "Inpaint",
	outpaint: "Outpaint",
	upscale: "Upscale",
	"remove-bg": "Remove Background",
}

export const PipelineSettings: React.FC = () => {
	const { t } = useAppTranslation()
	const [pipelines, setPipelines] = useState<PipelineSummary[]>([])
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
	const [pipelineToDelete, setPipelineToDelete] = useState<PipelineSummary | null>(null)
	const [importDialogOpen, setImportDialogOpen] = useState(false)
	const [importJson, setImportJson] = useState("")
	const [importError, setImportError] = useState<string | null>(null)
	const [isImporting, setIsImporting] = useState(false)

	const handleRefresh = useCallback(() => {
		vscode.postMessage({ type: "requestPipelines" })
	}, [])

	// Request pipelines on mount
	useEffect(() => {
		handleRefresh()
	}, [handleRefresh])

	// Listen for pipeline response messages
	useEffect(() => {
		const handler = (event: MessageEvent) => {
			const message = event.data
			if (message?.type === "pipelines" && message?.pipelines) {
				setPipelines(message.pipelines as PipelineSummary[])
			}
		}
		window.addEventListener("message", handler)
		return () => window.removeEventListener("message", handler)
	}, [])

	const handleDeleteClick = useCallback((pipeline: PipelineSummary) => {
		setPipelineToDelete(pipeline)
		setDeleteDialogOpen(true)
	}, [])

	const handleDeleteConfirm = useCallback(() => {
		if (pipelineToDelete) {
			vscode.postMessage({
				type: "deletePipeline",
				text: pipelineToDelete.slug,
			})
			setDeleteDialogOpen(false)
			setPipelineToDelete(null)
		}
	}, [pipelineToDelete])

	const handleImportSubmit = useCallback(async () => {
		setImportError(null)
		if (!importJson.trim()) {
			setImportError("Please paste pipeline JSON content")
			return
		}
		setIsImporting(true)
		try {
			vscode.postMessage({
				type: "importPipeline",
				text: importJson,
			})
			setImportDialogOpen(false)
			setImportJson("")
		} catch {
			setImportError("Failed to import pipeline")
		} finally {
			setIsImporting(false)
		}
	}, [importJson])

	const handleSetDefault = useCallback((pipeline: PipelineSummary) => {
		vscode.postMessage({
			type: "setDefaultPipeline",
			text: pipeline.slug,
		})
	}, [])

	// Group by type
	const groupedPipelines = useMemo(() => {
		const groups = new Map<string, PipelineSummary[]>()
		for (const p of pipelines) {
			const list = groups.get(p.type) || []
			list.push(p)
			groups.set(p.type, list)
		}
		// Sort groups by type label
		return Array.from(groups.entries()).sort(([a], [b]) => (typeLabels[a] ?? a).localeCompare(typeLabels[b] ?? b))
	}, [pipelines])

	const sourceIcon = (source: string) => {
		switch (source) {
			case "builtin":
				return <Package className="w-3.5 h-3.5 text-vscode-charts-yellow" />
			case "global":
				return <Globe className="w-3.5 h-3.5 text-vscode-charts-blue" />
			case "project":
				return <Folder className="w-3.5 h-3.5 text-vscode-charts-green" />
			default:
				return null
		}
	}

	return (
		<div className="flex flex-col h-full overflow-hidden">
			{/* Fixed Header */}
			<div className="flex-shrink-0">
				<SectionHeader description={t("settings:imageGeneration.pipelineSettingsDescription")}>
					{t("settings:imageGeneration.pipelineSettings")}
				</SectionHeader>
				<div className="flex flex-col gap-2 px-5 py-2">
					<div className="flex items-center justify-between">
						<p className="text-vscode-descriptionForeground text-sm m-0">
							<Trans i18nKey="settings:imageGeneration.pipelineSummary" count={pipelines.length}>
								{pipelines.length} pipeline(s) discovered
							</Trans>
						</p>
						<Button variant="secondary" className="py-1" onClick={() => setImportDialogOpen(true)}>
							<Upload className="w-3.5 h-3.5 mr-1" />
							{t("settings:imageGeneration.importPipeline")}
						</Button>
					</div>
				</div>
			</div>

			{/* Scrollable List Area */}
			<div className="flex-1 overflow-y-auto px-5 pb-4 min-h-0">
				{groupedPipelines.length === 0 ? (
					<p className="text-vscode-descriptionForeground text-sm italic mt-2">
						{t("settings:imageGeneration.noPipelinesFound")}
					</p>
				) : (
					groupedPipelines.map(([type, items]) => (
						<div key={type} className="mt-3">
							<h3 className="text-xs font-semibold text-vscode-sideBarTitle-foreground uppercase tracking-wide mb-1.5">
								{typeLabels[type] ?? type}
							</h3>
							<div className="flex flex-col gap-1.5">
								{items.map((pipeline) => (
									<div
										key={pipeline.slug}
										className="flex items-center justify-between px-3 py-2 rounded-md bg-vscode-sideBar-background border border-vscode-sideBar-border">
										<div className="flex items-center gap-2 min-w-0 flex-1">
											{sourceIcon(pipeline.source)}
											<div className="min-w-0">
												<div className="flex items-center gap-1.5">
													<span className="text-sm font-medium text-vscode-foreground truncate">
														{pipeline.name}
													</span>
													{pipeline.isDefault && (
														<span className="text-[10px] px-1.5 py-0 bg-vscode-badge-background text-vscode-badge-foreground rounded-full">
															default
														</span>
													)}
												</div>
												{pipeline.description && (
													<p className="text-xs text-vscode-descriptionForeground truncate m-0">
														{pipeline.description}
													</p>
												)}
												{pipeline.tags.length > 0 && (
													<div className="flex gap-1 mt-0.5">
														{pipeline.tags.map((tag) => (
															<span
																key={tag}
																className="text-[10px] px-1.5 py-0 bg-vscode-input-background text-vscode-descriptionForeground rounded">
																{tag}
															</span>
														))}
													</div>
												)}
											</div>
										</div>
										<div className="flex items-center gap-1 flex-shrink-0 ml-2">
											<StandardTooltip
												content={
													pipeline.isDefault
														? t("settings:imageGeneration.alreadyDefault")
														: t("settings:imageGeneration.setAsDefault")
												}>
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													disabled={pipeline.isDefault}
													onClick={() => handleSetDefault(pipeline)}>
													<Star
														className={`w-3.5 h-3.5 ${pipeline.isDefault ? "text-vscode-charts-yellow" : ""}`}
													/>
												</Button>
											</StandardTooltip>
											{pipeline.source !== "builtin" && (
												<StandardTooltip content={t("settings:imageGeneration.deletePipeline")}>
													<Button
														variant="ghost"
														size="icon"
														className="h-7 w-7 text-vscode-errorForeground"
														onClick={() => handleDeleteClick(pipeline)}>
														<Trash2 className="w-3.5 h-3.5" />
													</Button>
												</StandardTooltip>
											)}
										</div>
									</div>
								))}
							</div>
						</div>
					))
				)}
			</div>

			{/* Delete confirmation dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("settings:imageGeneration.deleteDialog.title")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings:imageGeneration.deleteDialog.description", {
								name: pipelineToDelete?.name ?? "",
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
							{t("settings:imageGeneration.deleteDialog.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleDeleteConfirm}>
							{t("settings:imageGeneration.deleteDialog.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Import dialog */}
			<AlertDialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
				<AlertDialogContent className="max-w-lg">
					<AlertDialogHeader>
						<AlertDialogTitle>{t("settings:imageGeneration.importDialog.title")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("settings:imageGeneration.importDialog.description")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="my-3">
						<Textarea
							placeholder="Paste ComfyUI workflow JSON here..."
							value={importJson}
							onChange={(e) => {
								setImportJson(e.target.value)
								setImportError(null)
							}}
							rows={10}
							className="font-mono text-xs"
						/>
						{importError && <p className="text-xs text-vscode-errorForeground mt-1">{importError}</p>}
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel
							onClick={() => {
								setImportDialogOpen(false)
								setImportJson("")
								setImportError(null)
							}}>
							{t("settings:imageGeneration.importDialog.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction onClick={handleImportSubmit} disabled={isImporting}>
							{isImporting
								? t("settings:imageGeneration.importDialog.importing")
								: t("settings:imageGeneration.importDialog.confirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	)
}
