import { useCallback, useState, useMemo } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { Sparkles, Plus, Trash2, CheckCircle2, ShieldCheck, Zap, RotateCcw } from "lucide-react"

import {
	type ProviderSettings,
	type OrganizationAllowList,
	DEFAULT_FREE_ROUTER_MODELS,
	freeRouterDefaultModelId,
	freeRouterModels,
} from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { getOpenRouterAuthUrl } from "@src/oauth/urls"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"
import { OpenRouterBalanceDisplay } from "./OpenRouterBalanceDisplay"

type FreeRouterProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	selectedModelId: string
	uriScheme: string | undefined
	simplifySettings?: boolean
	organizationAllowList: OrganizationAllowList
	modelValidationError?: string
}

export const FreeRouter = ({
	apiConfiguration,
	setApiConfigurationField,
	selectedModelId,
	uriScheme,
	simplifySettings,
	organizationAllowList,
	modelValidationError,
}: FreeRouterProps) => {
	const { t } = useAppTranslation()
	const [newCustomModel, setNewCustomModel] = useState("")

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	// Enabled models in router pool
	const currentPool = useMemo<string[]>(() => {
		if (Array.isArray(apiConfiguration?.freeRouterModels) && apiConfiguration.freeRouterModels.length > 0) {
			return apiConfiguration.freeRouterModels
		}
		return DEFAULT_FREE_ROUTER_MODELS.map((m) => m.id)
	}, [apiConfiguration?.freeRouterModels])

	const toggleModelInPool = useCallback(
		(modelId: string, checked: boolean) => {
			const updated = checked
				? Array.from(new Set([...currentPool, modelId]))
				: currentPool.filter((id) => id !== modelId)
			setApiConfigurationField("freeRouterModels", updated)
		},
		[currentPool, setApiConfigurationField],
	)

	const addCustomModel = useCallback(() => {
		const trimmed = newCustomModel.trim()
		if (!trimmed) return
		if (!currentPool.includes(trimmed)) {
			setApiConfigurationField("freeRouterModels", [...currentPool, trimmed])
		}
		setNewCustomModel("")
	}, [newCustomModel, currentPool, setApiConfigurationField])

	const removeCustomModel = useCallback(
		(modelId: string) => {
			setApiConfigurationField(
				"freeRouterModels",
				currentPool.filter((id) => id !== modelId),
			)
		},
		[currentPool, setApiConfigurationField],
	)

	const resetPoolToDefault = useCallback(() => {
		setApiConfigurationField(
			"freeRouterModels",
			DEFAULT_FREE_ROUTER_MODELS.map((m) => m.id),
		)
	}, [setApiConfigurationField])

	const effectiveApiKey = apiConfiguration?.freeRouterApiKey || apiConfiguration?.openRouterApiKey || ""

	return (
		<div className="flex flex-col gap-4">
			{/* Banner / Info Card */}
			<div className="rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/20 p-3.5 flex flex-col gap-2">
				<div className="flex items-center gap-2 text-vscode-foreground font-semibold">
					<Sparkles className="size-4 text-vscode-textLink-foreground" />
					<span>Free Models Auto-Router</span>
				</div>
				<p className="text-xs text-vscode-descriptionForeground leading-relaxed">
					Routes across high-performance free models (Google Gemma 4 31B, Qwen 3.8 27B, Cohere North Mini
					Code, NVIDIA Nemotron 3 Ultra, etc.). If any model hits rate limits (HTTP 429), quota limits, or
					endpoint downtime (HTTP 404), it is automatically placed into temporary cooldown and execution
					seamlessly fails over to the next healthy model without failing your task.
				</p>
			</div>

			{/* OpenRouter API Key Input */}
			<div className="flex flex-col gap-1">
				<VSCodeTextField
					value={effectiveApiKey}
					type="password"
					onInput={(e: any) => {
						const val = e.target.value
						setApiConfigurationField("freeRouterApiKey", val)
					}}
					placeholder="OpenRouter API Key (Free tier keys supported)"
					className="w-full">
					<div className="flex justify-between items-center mb-1">
						<label className="block font-medium">OpenRouter Free API Key</label>
						{effectiveApiKey && (
							<OpenRouterBalanceDisplay apiKey={effectiveApiKey} baseUrl="https://openrouter.ai/api/v1" />
						)}
					</div>
				</VSCodeTextField>
				<div className="text-xs text-vscode-descriptionForeground">
					Free models on OpenRouter require an OpenRouter account key (free tier, $0 credits needed).
				</div>
				{!effectiveApiKey && (
					<VSCodeButtonLink
						href={getOpenRouterAuthUrl(uriScheme)}
						style={{ width: "100%", marginTop: "4px" }}
						appearance="primary">
						Get Free OpenRouter API Key
					</VSCodeButtonLink>
				)}
			</div>

			{/* Automatic Model Routing Indicator (Manual Selection Disabled) */}
			<div className="rounded-lg border border-vscode-charts-green/30 bg-vscode-charts-green/10 p-3 flex items-start gap-2.5">
				<CheckCircle2 className="size-4 text-vscode-charts-green flex-shrink-0 mt-0.5" />
				<div className="flex flex-col gap-0.5">
					<span className="text-xs font-semibold text-vscode-foreground">Automated Model Routing Active</span>
					<p className="text-xs text-vscode-descriptionForeground leading-relaxed">
						Model selection is fully automated. Mirror VS continuously monitors endpoint health and routes
						requests across the healthy free models in your pool below. Manual model selection is disabled
						to avoid unavailable endpoints.
					</p>
				</div>
			</div>

			{/* Cooldown Settings */}
			<div className="flex flex-col gap-1">
				<VSCodeTextField
					value={String(apiConfiguration?.freeRouterCooldownMinutes ?? 10)}
					onInput={(e: any) => {
						const val = parseInt(e.target.value, 10)
						setApiConfigurationField("freeRouterCooldownMinutes", isNaN(val) ? 10 : val)
					}}
					placeholder="10"
					className="w-full">
					<label className="block font-medium text-sm mb-1">Failover Cooldown Duration (minutes)</label>
				</VSCodeTextField>
				<div className="text-xs text-vscode-descriptionForeground">
					Time to eliminate an exhausted free model before testing it again (default: 10 minutes).
				</div>
			</div>

			{/* Router Pool Management */}
			<div className="flex flex-col gap-2 pt-2 border-t border-vscode-panel-border">
				<div className="flex justify-between items-center">
					<div className="flex items-center gap-1.5 font-medium text-sm">
						<ShieldCheck className="size-4 text-vscode-charts-green" />
						<span>Auto-Router Failover Pool ({currentPool.length} active)</span>
					</div>
					<VSCodeButton
						appearance="icon"
						title="Reset to default free models"
						onClick={resetPoolToDefault}
						className="text-xs">
						<RotateCcw className="size-3.5 inline mr-1" />
						Reset Pool
					</VSCodeButton>
				</div>

				<div className="flex flex-col gap-2">
					{DEFAULT_FREE_ROUTER_MODELS.map((model, idx) => {
						const isEnabled = currentPool.includes(model.id)
						return (
							<div
								key={model.id}
								className={`flex items-start justify-between p-2.5 rounded border transition-colors ${
									isEnabled
										? "border-vscode-panel-border bg-vscode-editor-background"
										: "border-vscode-panel-border/40 opacity-60 bg-vscode-editor-inactiveSelectionBackground/10"
								}`}>
								<div className="flex items-start gap-2.5">
									<div className="pt-0.5">
										<Checkbox
											checked={isEnabled}
											onChange={(checked: boolean) => toggleModelInPool(model.id, checked)}
										/>
									</div>
									<div className="flex flex-col gap-0.5">
										<div className="flex items-center gap-1.5 flex-wrap">
											<span className="font-semibold text-xs text-vscode-foreground">
												{model.name}
											</span>
											<span className="text-[10px] px-1.5 py-0.2 rounded bg-vscode-charts-green/20 text-vscode-charts-green font-mono flex items-center gap-0.5">
												<CheckCircle2 className="size-2.5" />
												Ready
											</span>
										</div>
										<span className="text-[11px] text-vscode-descriptionForeground">
											{model.description}
										</span>
										<span className="text-[10px] text-vscode-descriptionForeground/70 font-mono">
											{(model.contextWindow / 1024).toFixed(0)}k ctx • max {model.maxTokens} out
										</span>
									</div>
								</div>
								<div className="text-[10px] text-vscode-descriptionForeground/60 font-mono pl-2">
									#{idx + 1}
								</div>
							</div>
						)
					})}

					{/* Custom Models in the pool */}
					{currentPool
						.filter((id) => !DEFAULT_FREE_ROUTER_MODELS.some((m) => m.id === id))
						.map((customId, idx) => (
							<div
								key={customId}
								className="flex items-center justify-between p-2.5 rounded border border-vscode-panel-border bg-vscode-editor-background">
								<div className="flex items-center gap-2">
									<Zap className="size-3.5 text-vscode-textLink-foreground" />
									<div className="flex flex-col">
										<span className="text-xs font-mono font-medium">{customId}</span>
										<span className="text-[10px] text-vscode-descriptionForeground">
											Custom Free Model
										</span>
									</div>
								</div>
								<VSCodeButton
									appearance="icon"
									onClick={() => removeCustomModel(customId)}
									title="Remove model">
									<Trash2 className="size-3.5 text-vscode-errorForeground" />
								</VSCodeButton>
							</div>
						))}
				</div>

				{/* Add Custom Free Model */}
				<div className="flex gap-2 items-center mt-2">
					<VSCodeTextField
						value={newCustomModel}
						onInput={(e: any) => setNewCustomModel(e.target.value)}
						placeholder="provider/model-id:free (e.g. meta-llama/llama-3.2-3b-instruct:free)"
						className="flex-1"
					/>
					<VSCodeButton appearance="secondary" onClick={addCustomModel}>
						<Plus className="size-3.5 inline mr-1" />
						Add Model
					</VSCodeButton>
				</div>
			</div>
		</div>
	)
}
