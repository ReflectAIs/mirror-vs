import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Trans } from "react-i18next"
import { ChevronsUpDown, Check, X, Info } from "lucide-react"

import { type ProviderSettings, type ModelInfo, type OrganizationAllowList, isRetiredProvider } from "@mirror-vs/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useSelectedModel } from "@/components/ui/hooks/useSelectedModel"
import { filterModels } from "./utils/organizationFilters"
import { cn } from "@src/lib/utils"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	Popover,
	PopoverContent,
	PopoverTrigger,
	Button,
} from "@src/components/ui"
import { useEscapeKey } from "@src/hooks/useEscapeKey"

import { ModelInfoView } from "./ModelInfoView"
import { ApiErrorMessage } from "./ApiErrorMessage"
import { ContextLimitControl } from "./ContextLimitControl"

type ModelIdKey = keyof Pick<
	ProviderSettings,
	| "openRouterModelId"
	| "requestyModelId"
	| "unboundModelId"
	| "openAiModelId"
	| "litellmModelId"
	| "vercelAiGatewayModelId"
	| "apiModelId"
	| "ollamaModelId"
	| "lmStudioModelId"
	| "lmStudioDraftModelId"
	| "vsCodeLmModelSelector"
	| "customModelId"
>

interface ModelPickerProps {
	defaultModelId: string
	models: Record<string, ModelInfo> | null
	modelIdKey: ModelIdKey
	serviceName: string
	serviceUrl: string
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	organizationAllowList?: OrganizationAllowList
	errorMessage?: string
	simplifySettings?: boolean
	hidePricing?: boolean
	/** Label for the model picker field - defaults to "Model" */
	label?: string
	/** Transform model ID string to the value stored in configuration (for compound types like VSCodeLM selector) */
	valueTransform?: (modelId: string) => unknown
	/** Transform stored configuration value back to display string */
	displayTransform?: (value: unknown) => string
	/** Callback when model changes - useful for side effects like clearing related fields */
	onModelChange?: (modelId: string) => void
}

export const ModelPicker = ({
	defaultModelId,
	models,
	modelIdKey,
	serviceName,
	serviceUrl,
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	errorMessage,
	simplifySettings,
	hidePricing,
	label,
	valueTransform,
	displayTransform,
	onModelChange,
}: ModelPickerProps) => {
	const { t } = useAppTranslation()

	const [open, setOpen] = useState(false)
	const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)
	const isInitialized = useRef(false)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const selectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

	const [savedCustomModels, setSavedCustomModels] = useState<string[]>(() => {
		try {
			const saved = localStorage.getItem(`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`)
			return saved ? JSON.parse(saved) : []
		} catch (e) {
			return []
		}
	})

	const [deletedDefaultModels, setDeletedDefaultModels] = useState<string[]>(() => {
		try {
			const saved = localStorage.getItem(`deleted_models_${apiConfiguration.apiProvider}_${modelIdKey}`)
			return saved ? JSON.parse(saved) : []
		} catch (e) {
			return []
		}
	})

	useEffect(() => {
		try {
			const savedCustom = localStorage.getItem(`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`)
			setSavedCustomModels(savedCustom ? JSON.parse(savedCustom) : [])
			const savedDeleted = localStorage.getItem(`deleted_models_${apiConfiguration.apiProvider}_${modelIdKey}`)
			setDeletedDefaultModels(savedDeleted ? JSON.parse(savedDeleted) : [])
		} catch (e) {
			setSavedCustomModels([])
			setDeletedDefaultModels([])
		}
	}, [apiConfiguration.apiProvider, modelIdKey])

	const { id: selectedModelId, info: selectedModelInfo } = useSelectedModel(apiConfiguration)

	// Get the display value for the current selection
	// If displayTransform is provided, use it to convert the stored value to a display string
	const displayValue = useMemo(() => {
		if (displayTransform) {
			const storedValue = apiConfiguration[modelIdKey]
			return storedValue ? displayTransform(storedValue) : undefined
		}
		return selectedModelId
	}, [displayTransform, apiConfiguration, modelIdKey, selectedModelId])

	const activeProvider =
		apiConfiguration.apiProvider && isRetiredProvider(apiConfiguration.apiProvider)
			? undefined
			: apiConfiguration.apiProvider

	const modelIds = useMemo(() => {
		const filteredModels = filterModels(models, activeProvider, organizationAllowList)

		// Include the currently selected model even if deprecated (so users can see what they have selected)
		// But filter out other deprecated models from being newly selectable
		const availableModels = Object.entries(filteredModels ?? {})
			.filter(([modelId, modelInfo]) => {
				// Always include the currently selected model
				if (modelId === selectedModelId) return true
				// Filter out deprecated models that aren't currently selected
				return !modelInfo.deprecated
			})
			.reduce(
				(acc, [modelId, modelInfo]) => {
					acc[modelId] = modelInfo
					return acc
				},
				{} as Record<string, ModelInfo>,
			)

		const defaultKeys = Object.keys(availableModels)
		const filteredDefaults = defaultKeys.filter((m) => !deletedDefaultModels.includes(m))
		const merged = Array.from(new Set([...filteredDefaults, ...savedCustomModels]))
		return merged.sort((a, b) => a.localeCompare(b))
	}, [models, activeProvider, organizationAllowList, selectedModelId, savedCustomModels, deletedDefaultModels])

	const [searchValue, setSearchValue] = useState("")

	const onSelect = useCallback(
		(modelId: string) => {
			if (!modelId) {
				return
			}

			setOpen(false)

			// If it was a deleted default model, restore it
			if (deletedDefaultModels.includes(modelId)) {
				setDeletedDefaultModels((prev) => {
					const next = prev.filter((m) => m !== modelId)
					localStorage.setItem(
						`deleted_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
						JSON.stringify(next),
					)
					return next
				})
			} else {
				// If it's a new custom model, save it to the persistent list
				const isDefault = Object.keys(
					filterModels(models, activeProvider, organizationAllowList) ?? {},
				).includes(modelId)
				if (!isDefault && modelId.trim()) {
					setSavedCustomModels((prev) => {
						if (prev.includes(modelId)) return prev
						const next = [...prev, modelId]
						localStorage.setItem(
							`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
							JSON.stringify(next),
						)
						return next
					})
				}
			}

			// Apply value transform if provided (e.g., for VSCodeLM selector)
			const valueToStore = valueTransform ? valueTransform(modelId) : modelId
			setApiConfigurationField(modelIdKey, valueToStore as ProviderSettings[ModelIdKey])

			// Call the optional change callback
			onModelChange?.(modelId)

			// Clear any existing timeout
			if (selectTimeoutRef.current) {
				clearTimeout(selectTimeoutRef.current)
			}

			// Delay to ensure the popover is closed before setting the search value.
			selectTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
		},
		[
			modelIdKey,
			setApiConfigurationField,
			valueTransform,
			onModelChange,
			models,
			activeProvider,
			organizationAllowList,
			deletedDefaultModels,
		],
	)

	const onOpenChange = useCallback((open: boolean) => {
		setOpen(open)

		// Abandon the current search if the popover is closed.
		if (!open) {
			// Clear any existing timeout
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current)
			}

			// Clear the search value when closing instead of prefilling it
			closeTimeoutRef.current = setTimeout(() => setSearchValue(""), 100)
		}
	}, [])

	const onClearSearch = useCallback(() => {
		setSearchValue("")
		searchInputRef.current?.focus()
	}, [])

	useEffect(() => {
		if (!selectedModelId && !isInitialized.current) {
			const initialValue = modelIds.includes(selectedModelId) ? selectedModelId : defaultModelId
			setApiConfigurationField(modelIdKey, initialValue, false) // false = automatic initialization
		}

		isInitialized.current = true
	}, [modelIds, setApiConfigurationField, modelIdKey, selectedModelId, defaultModelId])

	// Cleanup timeouts on unmount to prevent test flakiness
	useEffect(() => {
		return () => {
			if (selectTimeoutRef.current) {
				clearTimeout(selectTimeoutRef.current)
			}
			if (closeTimeoutRef.current) {
				clearTimeout(closeTimeoutRef.current)
			}
		}
	}, [])

	// Use the shared ESC key handler hook
	useEscapeKey(open, () => setOpen(false))

	return (
		<>
			<div>
				<label className="block font-medium mb-1">{label ?? t("settings:modelPicker.label")}</label>
				<Popover open={open} onOpenChange={onOpenChange}>
					<PopoverTrigger asChild>
						<Button
							variant="combobox"
							role="combobox"
							aria-expanded={open}
							className="w-full justify-between"
							data-testid="model-picker-button">
							<div className="truncate">{displayValue ?? t("settings:common.select")}</div>
							<ChevronsUpDown className="opacity-50" />
						</Button>
					</PopoverTrigger>
					<PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
						<Command>
							<div className="relative">
								<CommandInput
									ref={searchInputRef}
									value={searchValue}
									onValueChange={setSearchValue}
									placeholder={t("settings:modelPicker.searchPlaceholder")}
									className="h-9 mr-4"
									data-testid="model-input"
								/>
								{searchValue.length > 0 && (
									<div className="absolute right-2 top-0 bottom-0 flex items-center justify-center">
										<X
											className="text-vscode-input-foreground opacity-50 hover:opacity-100 size-4 p-0.5 cursor-pointer"
											onClick={onClearSearch}
										/>
									</div>
								)}
							</div>
							<CommandList>
								<CommandEmpty>
									{searchValue && (
										<div className="py-2 px-1 text-sm">
											{t("settings:modelPicker.noMatchFound")}
										</div>
									)}
								</CommandEmpty>
								<CommandGroup>
									{modelIds.map((model) => (
										<CommandItem
											key={model}
											value={model}
											onSelect={onSelect}
											data-testid={`model-option-${model}`}>
											<span className="truncate" title={model}>
												{model}
											</span>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
							{searchValue && !modelIds.includes(searchValue) && (
								<div className="p-1 border-t border-vscode-input-border">
									<CommandItem data-testid="use-custom-model" value={searchValue} onSelect={onSelect}>
										{t("settings:modelPicker.useCustomModel", { modelId: searchValue })}
									</CommandItem>
								</div>
							)}
						</Command>
					</PopoverContent>
				</Popover>
			</div>

			{/* Saved custom models list manager */}
			<div className="mt-2 space-y-2 border border-vscode-panel-border/30 rounded-md p-2.5 bg-vscode-sideBar-background/15">
				<div className="flex justify-between items-center">
					<label className="text-[11px] font-bold tracking-wide uppercase text-vscode-foreground opacity-90">
						Custom Model Manager
					</label>
				</div>
				<div className="flex gap-2">
					<input
						type="text"
						id={`new-custom-model-input-${modelIdKey}`}
						placeholder="Add custom model (e.g. deepseek-v4-flash)"
						className="flex-1 h-7 px-2 text-xs bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded focus:outline-none focus:border-mirror-brand-via"
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								const input = e.currentTarget
								const val = input.value.trim()
								if (val && !modelIds.includes(val)) {
									setSavedCustomModels((prev) => {
										const next = [...prev, val]
										localStorage.setItem(
											`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
											JSON.stringify(next),
										)
										return next
									})
									onSelect(val)
									input.value = ""
								}
							}
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						className="h-7 text-xs px-2.5"
						onClick={() => {
							const input = document.getElementById(
								`new-custom-model-input-${modelIdKey}`,
							) as HTMLInputElement
							const val = input?.value.trim()
							if (val && !modelIds.includes(val)) {
								setSavedCustomModels((prev) => {
									const next = [...prev, val]
									localStorage.setItem(
										`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
										JSON.stringify(next),
									)
									return next
								})
								onSelect(val)
								input.value = ""
							}
						}}>
						Add
					</Button>
				</div>
				{modelIds.length > 0 && (
					<div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto pt-1">
						{modelIds.map((model) => {
							const isCustom = savedCustomModels.includes(model)
							const isSelected = model === displayValue
							return (
								<span
									key={model}
									className={cn(
										"inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] border transition-all cursor-pointer",
										isSelected
											? "bg-mirror-brand-via/10 text-vscode-foreground border-mirror-brand-via/30 font-medium"
											: "bg-vscode-badge-background/50 text-vscode-badge-foreground border-vscode-panel-border/30 hover:bg-vscode-badge-background",
									)}
									onClick={() => onSelect(model)}>
									<span>{model}</span>
									<button
										className="p-0 border-none bg-transparent cursor-pointer text-vscode-descriptionForeground hover:text-vscode-errorForeground flex items-center justify-center ml-0.5"
										onClick={(e) => {
											e.stopPropagation()
											if (isCustom) {
												setSavedCustomModels((prev) => {
													const next = prev.filter((m) => m !== model)
													localStorage.setItem(
														`custom_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
														JSON.stringify(next),
													)
													return next
												})
											} else {
												setDeletedDefaultModels((prev) => {
													const next = [...prev, model]
													localStorage.setItem(
														`deleted_models_${apiConfiguration.apiProvider}_${modelIdKey}`,
														JSON.stringify(next),
													)
													return next
												})
											}
											// If the deleted model was the currently selected one, fallback to default
											if (model === displayValue) {
												onSelect(defaultModelId)
											}
										}}
										title={`Remove ${model}`}>
										<X className="size-3" />
									</button>
								</span>
							)
						})}
					</div>
				)}
			</div>
			{errorMessage && <ApiErrorMessage errorMessage={errorMessage} />}
			{selectedModelInfo?.deprecated && (
				<ApiErrorMessage errorMessage={t("settings:validation.modelDeprecated")} />
			)}

			{simplifySettings ? (
				<p className="text-xs text-vscode-descriptionForeground m-0">
					<Info className="size-3 inline mr-1" />
					{t("settings:modelPicker.simplifiedExplanation")}
				</p>
			) : (
				<div>
					{selectedModelId && selectedModelInfo && !selectedModelInfo.deprecated && (
						<ModelInfoView
							apiProvider={apiConfiguration.apiProvider}
							selectedModelId={selectedModelId}
							modelInfo={selectedModelInfo}
							isDescriptionExpanded={isDescriptionExpanded}
							setIsDescriptionExpanded={setIsDescriptionExpanded}
							hidePricing={hidePricing}
						/>
					)}
					{selectedModelId && (
						<ContextLimitControl
							value={apiConfiguration.modelContextLimit}
							onChange={(value) => setApiConfigurationField("modelContextLimit", value)}
							maxLimit={selectedModelInfo?.contextWindow || 1000000}
						/>
					)}
					{!hidePricing && (
						<div className="text-sm text-vscode-descriptionForeground">
							<Trans
								i18nKey="settings:modelPicker.automaticFetch"
								components={{
									serviceLink: <VSCodeLink href={serviceUrl} className="text-sm" />,
									defaultModelLink: (
										<VSCodeLink onClick={() => onSelect(defaultModelId)} className="text-sm" />
									),
								}}
								values={{ serviceName, defaultModelId }}
							/>
						</div>
					)}
				</div>
			)}
		</>
	)
}
