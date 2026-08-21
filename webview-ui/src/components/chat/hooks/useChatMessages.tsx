/**
 * useChatMessages
 *
 * Extracted from ChatView.tsx (~2,445 lines) to reduce component complexity.
 * Owns all message state, computed values, effects, and callback handlers.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useEvent } from "react-use"
import useSound from "use-sound"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { LRUCache } from "lru-cache"
import removeMd from "remove-markdown"
import { VirtuosoHandle } from "react-virtuoso"

import type {
	MirrorAsk,
	MirrorSayTool,
	MirrorMessage,
	ExtensionMessage,
	AudioType,
	ProviderSettings,
	ModelInfo,
	QueuedMessage,
	SuggestionItem,
} from "@mirror-vs/types"
import { isRetiredProvider, type ProviderName, type RouterModels } from "@mirror-vs/types"

import { findLast, findLastIndex } from "@shared/array"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences, COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences"
import { getApiMetrics } from "@shared/getApiMetrics"
import { getAllModes } from "@shared/modes"
import { ProfileValidator } from "@shared/ProfileValidator"
import { getLatestTodo } from "@shared/todo"

import { vscode } from "@src/utils/vscode"
import { useDebounceEffect } from "@src/utils/useDebounceEffect"
import { appendImages } from "@src/utils/imageUtils"
import { batchConsecutive } from "@src/utils/batchConsecutive"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import { getDefaultModelIdForProvider, getProviderServiceConfig } from "../../settings/utils/providerModelConfig"
import { MODELS_BY_PROVIDER } from "../../settings/constants"

import type { ModelActivity } from "@src/components/welcome/MirrorHero"
import { getModelMaxOutputTokens } from "@shared/api"
import { formatLargeNumber } from "@src/utils/format"
import { MAX_IMAGES_PER_MESSAGE } from "../ChatView"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseChatMessagesOptions {
	messages: MirrorMessage[]
	currentTaskItem: any
	currentTaskTodos: any[] | undefined
	apiConfiguration: ProviderSettings | undefined
	organizationAllowList: any
	mode: string
	setMode: (mode: string) => void
	setApiConfiguration: (value: ProviderSettings) => void
	customModes: any[]
	soundEnabled: boolean
	soundVolume: number
	messageQueue: QueuedMessage[]
	isHidden: boolean
	routerModels: RouterModels | undefined
	t: (key: string) => string
	/** From useScrollLifecycle — called when user starts browsing history via row expansion */
	onUserExpandedRow?: (source: string) => void
}

export interface UseChatMessagesReturn {
	// ── Refs (stable, for Virtuoso Item) ──
	virtuosoRef: React.RefObject<VirtuosoHandle | null>
	scrollContainerRef: React.RefObject<HTMLDivElement | null>
	textAreaRef: React.RefObject<HTMLTextAreaElement | null>
	inputValueRef: React.MutableRefObject<string>
	stickyUserIndexRef: React.MutableRefObject<number | null>
	displayedMessagesRef: React.MutableRefObject<MirrorMessage[]>
	checkpointJumpCursorRef: React.MutableRefObject<number | null>
	mirrorAskRef: React.MutableRefObject<MirrorAsk | undefined>

	// ── UI State ──
	inputValue: string
	setInputValue: React.Dispatch<React.SetStateAction<string>>
	selectedImages: string[]
	setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>
	currentFollowUpTs: number | null
	modeShortcutText: string
	sendingDisabled: boolean
	setSendingDisabled: React.Dispatch<React.SetStateAction<boolean>>
	mirrorAsk: MirrorAsk | undefined
	setMirrorAsk: React.Dispatch<React.SetStateAction<MirrorAsk | undefined>>
	enableButtons: boolean
	primaryButtonText: string | undefined
	secondaryButtonText: string | undefined
	expandedRows: Record<number, boolean>
	activeHeaderPanel: "stats" | "todos" | "notes" | "none"
	setActiveHeaderPanel: React.Dispatch<React.SetStateAction<"stats" | "todos" | "notes" | "none">>
	checkpointWarning: { type: "WAIT_TIMEOUT" | "INIT_TIMEOUT"; timeout: number } | undefined
	isCondensing: boolean
	isFollowUpAutoApprovalPaused: boolean
	isProfileDisabled: boolean
	optimisticQueue: QueuedMessage[]
	effectiveQueue: QueuedMessage[]
	showRetiredProviderWarning: boolean
	setShowRetiredProviderWarning: React.Dispatch<React.SetStateAction<boolean>>
	aggregatedCostsMap: Map<string, { totalCost: number; ownCost: number; childrenCost: number }>
	stickyUserIndex: number | null
	showAnnouncementModal: boolean
	setShowAnnouncementModal: React.Dispatch<React.SetStateAction<boolean>>
	messageLimit: number
	setMessageLimit: React.Dispatch<React.SetStateAction<number>>

	// ── Computed values ──
	task: MirrorMessage | undefined
	latestTodos: any[] | undefined
	apiMetrics: ReturnType<typeof getApiMetrics>
	modifiedMessages: MirrorMessage[]
	visibleMessages: MirrorMessage[]
	groupedMessages: MirrorMessage[]
	displayedMessages: MirrorMessage[]
	userFeedbackIndices: number[]
	checkpointIndices: number[]
	hasLatestCheckpoint: boolean
	isStreaming: boolean
	messageWillQueue: boolean
	modelActivity: ModelActivity
	lastMessage: MirrorMessage | undefined
	modelPickerConfig: {
		modelIdKey:
			| "apiModelId"
			| "openRouterModelId"
			| "requestyModelId"
			| "unboundModelId"
			| "litellmModelId"
			| "vercelAiGatewayModelId"
			| "openAiModelId"
			| "ollamaModelId"
			| "lmStudioModelId"
			| "vsCodeLmModelSelector"
			| "customModelId"
		models: Record<string, ModelInfo> | null
		defaultModelId: string
		serviceName: string
		serviceUrl: string
	} | null
	modelOptions: Array<{ value: string; label: string }> | undefined
	modelId: string | undefined
	model: ModelInfo | undefined
	latestUserMessage: MirrorMessage | null
	placeholderText: string
	shouldDisableImages: boolean

	// ── Handlers ──
	handleSendMessage: (text: string, images: string[], forceSend?: boolean) => void
	handleSetChatBoxMessage: (text: string, images: string[]) => void
	handleStopTask: () => void
	handleEnqueueCurrentMessage: () => void
	handlePrimaryButtonClick: (text?: string, images?: string[]) => void
	handleSecondaryButtonClick: (text?: string, images?: string[]) => void
	handleSetExpandedRow: (ts: number, expand?: boolean) => void
	toggleRowExpansion: (ts: number) => void
	handleCondenseContext: (taskId: string) => void
	markFollowUpAsAnswered: () => void
	handleChatReset: () => void
	handleModelChange: (newModelId: string) => void
	switchToMode: (modeSlug: string) => void
	handleSuggestionClickInRow: (suggestion: SuggestionItem, event?: React.MouseEvent) => void
	handleBatchFileResponse: (response: { [key: string]: boolean }) => void
	handleFollowUpUnmount: () => void
	playSound: (audioType: AudioType) => void
	handleScrollToBottomAndResetCheckpointCursor: () => void
	handleScrollToLatestCheckpoint: () => void
	handleNavigateToMessage: (ts: number) => void
	handleRangeChanged: (range: { startIndex: number; endIndex: number }) => void
	virtuosoComponents: {
		Item: (props: any) => JSX.Element
	}
}

const playScifiSuccess = (volume: number) => {
	try {
		const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
		if (!AudioContextClass) return
		const ctx = new AudioContextClass()
		const now = ctx.currentTime

		// Cute ascending futuristic synth chime arpeggio
		const notes = [523.25, 659.25, 783.99, 1046.5]
		notes.forEach((freq, index) => {
			const osc = ctx.createOscillator()
			const gain = ctx.createGain()

			osc.type = "sine"
			osc.frequency.setValueAtTime(freq, now + index * 0.06)
			osc.frequency.exponentialRampToValueAtTime(freq * 1.15, now + index * 0.06 + 0.15)

			gain.gain.setValueAtTime(0, now + index * 0.06)
			gain.gain.linearRampToValueAtTime(volume * 0.25, now + index * 0.06 + 0.02)
			gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.06 + 0.25)

			osc.connect(gain)
			gain.connect(ctx.destination)

			osc.start(now + index * 0.06)
			osc.stop(now + index * 0.06 + 0.28)
		})
	} catch (e) {
		console.error("Sci-fi sound play error:", e)
	}
}

const playScifiError = (volume: number) => {
	try {
		const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
		if (!AudioContextClass) return
		const ctx = new AudioContextClass()
		const now = ctx.currentTime

		const osc = ctx.createOscillator()
		const gain = ctx.createGain()

		osc.type = "triangle"
		osc.frequency.setValueAtTime(240, now)
		osc.frequency.exponentialRampToValueAtTime(75, now + 0.35)

		const lfo = ctx.createOscillator()
		const lfoGain = ctx.createGain()
		lfo.frequency.value = 14
		lfoGain.gain.value = 35

		lfo.connect(lfoGain)
		lfoGain.connect(osc.frequency)

		gain.gain.setValueAtTime(volume * 0.35, now)
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4)

		osc.connect(gain)
		gain.connect(ctx.destination)

		lfo.start(now)
		osc.start(now)

		lfo.stop(now + 0.45)
		osc.stop(now + 0.45)
	} catch (e) {
		console.error("Sci-fi sound play error:", e)
	}
}

const playScifiProgress = (volume: number) => {
	try {
		const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
		if (!AudioContextClass) return
		const ctx = new AudioContextClass()
		const now = ctx.currentTime

		const osc = ctx.createOscillator()
		const gain = ctx.createGain()

		osc.type = "sine"
		osc.frequency.setValueAtTime(880, now)
		osc.frequency.exponentialRampToValueAtTime(440, now + 0.1)

		gain.gain.setValueAtTime(volume * 0.15, now)
		gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1)

		osc.connect(gain)
		gain.connect(ctx.destination)

		osc.start(now)
		osc.stop(now + 0.12)
	} catch (e) {
		console.error("Sci-fi sound play error:", e)
	}
}

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChatMessages(options: UseChatMessagesOptions): UseChatMessagesReturn {
	const {
		messages,
		currentTaskItem,
		currentTaskTodos,
		apiConfiguration,
		organizationAllowList,
		mode,
		setMode,
		setApiConfiguration,
		customModes,
		soundEnabled,
		soundVolume,
		messageQueue = [],
		isHidden,
		routerModels,
		t,
		onUserExpandedRow,
	} = options

	const { activeTerminals = [] } = useExtensionState()

	// ── Constants ──
	const [audioBaseUri] = useState(() => {
		return (window as unknown as { AUDIO_BASE_URI?: string }).AUDIO_BASE_URI || ""
	})
	const modeShortcutText = `${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}, ${isMac ? "⌘" : "Ctrl"} + Shift + . ${t("chat:forPreviousMode")}`

	// ── Optimistic Queue ──
	const [optimisticQueue, setOptimisticQueue] = useState<QueuedMessage[]>([])
	const effectiveQueue = useMemo(() => {
		if (messageQueue.length > 0) {
			return messageQueue
		}
		return optimisticQueue
	}, [messageQueue, optimisticQueue])

	useEffect(() => {
		if (messageQueue.length > 0) {
			setOptimisticQueue([])
		}
	}, [messageQueue])

	// ── UI State ──
	const [showRetiredProviderWarning, setShowRetiredProviderWarning] = useState(false)
	const [activeHeaderPanel, setActiveHeaderPanel] = useState<"stats" | "todos" | "notes" | "none">("none")
	const [messageLimit, setMessageLimit] = useState(120)

	const providerName = apiConfiguration?.apiProvider
	useEffect(() => {
		setShowRetiredProviderWarning(false)
	}, [providerName])

	const messagesRef = useRef(messages)
	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	const task = useMemo(() => messages.at(0), [messages])

	const latestTodos = useMemo(() => {
		if (currentTaskTodos && currentTaskTodos.length > 0) {
			const messageBasedTodos = getLatestTodo(messages)
			if (messageBasedTodos && messageBasedTodos.length > 0) {
				return messageBasedTodos
			}
			return currentTaskTodos
		}
		return getLatestTodo(messages)
	}, [messages, currentTaskTodos])

	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages)), [messages])

	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const inputValueRef = useRef(inputValue)
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [sendingDisabled, setSendingDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	const [mirrorAsk, setMirrorAsk] = useState<MirrorAsk | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>(undefined)
	const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>(undefined)
	const [_didClickCancel, setDidClickCancel] = useState(false)
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const prevExpandedRowsRef = useRef<Record<number, boolean>>()
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const lastTtsRef = useRef<string>("")
	const [wasStreaming, setWasStreaming] = useState<boolean>(false)
	const [checkpointWarning, setCheckpointWarning] = useState<
		{ type: "WAIT_TIMEOUT" | "INIT_TIMEOUT"; timeout: number } | undefined
	>(undefined)
	const [isCondensing, setIsCondensing] = useState<boolean>(false)
	const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
	const everVisibleMessagesTsRef = useRef<LRUCache<number, boolean>>(
		new LRUCache({
			max: 100,
			ttl: 1000 * 60 * 5,
		}),
	)
	const autoApproveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const userRespondedRef = useRef<boolean>(false)
	const [currentFollowUpTs, setCurrentFollowUpTs] = useState<number | null>(null)
	const [aggregatedCostsMap, setAggregatedCostsMap] = useState<
		Map<
			string,
			{
				totalCost: number
				ownCost: number
				childrenCost: number
			}
		>
	>(new Map())

	const mirrorAskRef = useRef(mirrorAsk)
	useEffect(() => {
		mirrorAskRef.current = mirrorAsk
	}, [mirrorAsk])

	useEffect(() => {
		inputValueRef.current = inputValue
	}, [inputValue])

	const isFollowUpAutoApprovalPaused = useMemo(() => {
		return !!(inputValue && inputValue.trim().length > 0 && mirrorAsk === "followup")
	}, [inputValue, mirrorAsk])

	useEffect(() => {
		if (isFollowUpAutoApprovalPaused) {
			vscode.postMessage({ type: "cancelAutoApproval" })
		}
	}, [isFollowUpAutoApprovalPaused])

	const isProfileDisabled = useMemo(
		() => !!apiConfiguration && !ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList),
		[apiConfiguration, organizationAllowList],
	)

	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	// ── Sound ──
	const volume = typeof soundVolume === "number" ? soundVolume : 0.5
	const [playNotification] = useSound(`${audioBaseUri}/notification.wav`, {
		volume,
		soundEnabled,
		interrupt: true,
	})
	const [playCelebration] = useSound(`${audioBaseUri}/celebration.wav`, {
		volume,
		soundEnabled,
		interrupt: true,
	})
	const [playProgressLoop] = useSound(`${audioBaseUri}/progress_loop.wav`, {
		volume,
		soundEnabled,
		interrupt: true,
	})

	const { soundTheme = "classic" } = useExtensionState()
	const lastPlayedRef = useRef<Record<string, number>>({})

	const playSound = useCallback(
		(audioType: AudioType) => {
			if (!soundEnabled) {
				return
			}

			const now = Date.now()
			const lastPlayed = lastPlayedRef.current[audioType] ?? 0
			if (now - lastPlayed < 100) {
				return
			}
			lastPlayedRef.current[audioType] = now

			if (soundTheme === "scifi") {
				switch (audioType) {
					case "notification":
						// Play synthesized sci-fi warning sweep
						playScifiError(volume)
						break
					case "celebration":
						// Play synthesized sci-fi success chime arpeggio
						playScifiSuccess(volume)
						break
					case "progress_loop":
						// Play synthesized sci-fi click
						playScifiProgress(volume)
						break
					default:
						console.warn(`Unknown audio type: ${audioType}`)
				}
				return
			}

			switch (audioType) {
				case "notification":
					playNotification()
					break
				case "celebration":
					playCelebration()
					break
				case "progress_loop":
					playProgressLoop()
					break
				default:
					console.warn(`Unknown audio type: ${audioType}`)
			}
		},
		[soundEnabled, soundTheme, volume, playNotification, playCelebration, playProgressLoop],
	)

	function playTts(text: string) {
		vscode.postMessage({ type: "playTts", text })
	}

	// ── Main ask/say effect ──
	useDeepCompareEffect(() => {
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					userRespondedRef.current = false
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							playSound("progress_loop")
							setSendingDisabled(true)
							setMirrorAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:retry.title"))
							setSecondaryButtonText(undefined)
							break
						case "mistake_limit_reached":
							playSound("progress_loop")
							setSendingDisabled(false)
							setMirrorAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedAnyways.title"))
							setSecondaryButtonText(undefined)
							break
						case "followup":
							setSendingDisabled(isPartial)
							setMirrorAsk("followup")
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "tool":
							setSendingDisabled(isPartial)
							setMirrorAsk("tool")
							setEnableButtons(!isPartial)
							const tool = JSON.parse(lastMessage.text || "{}") as MirrorSayTool
							switch (tool.tool) {
								case "editedExistingFile":
								case "appliedDiff":
								case "newFileCreated":
									if (tool.batchDiffs && Array.isArray(tool.batchDiffs)) {
										setPrimaryButtonText(t("chat:edit-batch.approve.title"))
										setSecondaryButtonText(t("chat:edit-batch.deny.title"))
									} else {
										setPrimaryButtonText(t("chat:save.title"))
										setSecondaryButtonText(t("chat:reject.title"))
									}
									break
								case "generateImage":
									setPrimaryButtonText(t("chat:save.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
								case "finishTask":
									setPrimaryButtonText(t("chat:completeSubtaskAndReturn"))
									setSecondaryButtonText(undefined)
									break
								case "readFile":
									if (tool.batchFiles && Array.isArray(tool.batchFiles)) {
										setPrimaryButtonText(t("chat:read-batch.approve.title"))
										setSecondaryButtonText(t("chat:read-batch.deny.title"))
									} else {
										setPrimaryButtonText(t("chat:approve.title"))
										setSecondaryButtonText(t("chat:reject.title"))
									}
									break
								case "listFilesTopLevel":
								case "listFilesRecursive":
									if (tool.batchDirs && Array.isArray(tool.batchDirs)) {
										setPrimaryButtonText(t("chat:list-batch.approve.title"))
										setSecondaryButtonText(t("chat:list-batch.deny.title"))
									} else {
										setPrimaryButtonText(t("chat:approve.title"))
										setSecondaryButtonText(t("chat:reject.title"))
									}
									break
								default:
									setPrimaryButtonText(t("chat:approve.title"))
									setSecondaryButtonText(t("chat:reject.title"))
									break
							}
							break
						case "command": {
							const isExecuting = lastMessage.text?.includes(COMMAND_OUTPUT_STRING)
							// Check if the command is currently in the active terminals list to prevent showing buttons after start
							const cmdStr = lastMessage.text || ""
							const isCurrentlyRunning =
								activeTerminals.some((t) => t.command && cmdStr.includes(t.command)) || isExecuting

							if (isCurrentlyRunning) {
								setSendingDisabled(false)
								setMirrorAsk(undefined)
								setEnableButtons(false)
								setPrimaryButtonText(undefined)
								setSecondaryButtonText(undefined)
							} else {
								setSendingDisabled(isPartial)
								setMirrorAsk("command")
								setEnableButtons(!isPartial)
								setPrimaryButtonText(t("chat:runCommand.title"))
								setSecondaryButtonText(t("chat:reject.title"))
							}
							break
						}
						case "command_output":
							setSendingDisabled(false)
							setMirrorAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText(t("chat:proceedWhileRunning.title"))
							setSecondaryButtonText(t("chat:killCommand.title"))
							break
						case "use_mcp_server":
							setSendingDisabled(isPartial)
							setMirrorAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:approve.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
						case "completion_result":
							if (!isPartial && messageQueue.length === 0) {
								playSound("celebration")
							}
							setSendingDisabled(isPartial)
							setMirrorAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							setSendingDisabled(false)
							setMirrorAsk("resume_task")
							setEnableButtons(true)
							const isCompletedSubtask =
								currentTaskItem?.parentTaskId &&
								messages.some(
									(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
								)
							if (isCompletedSubtask) {
								setPrimaryButtonText(undefined)
								setSecondaryButtonText(undefined)
							} else {
								setPrimaryButtonText(t("chat:resumeTask.title"))
								setSecondaryButtonText(t("chat:terminate.title"))
							}
							setDidClickCancel(false)
							break
						case "resume_completed_task":
							setSendingDisabled(false)
							setMirrorAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
					}
					break
				case "say":
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
						case "api_req_rate_limit_wait":
							setSendingDisabled(true)
							break
						case "api_req_started":
							setSendingDisabled(true)
							setMirrorAsk(undefined)
							setEnableButtons(false)
							setPrimaryButtonText(undefined)
							setSecondaryButtonText(undefined)
							break
						case "api_req_finished":
						case "error":
						case "text":
						case "command_output":
						case "mcp_server_request_started":
						case "mcp_server_response":
						case "completion_result":
							break
					}
					break
			}
		}
	}, [lastMessage, secondLastMessage, activeTerminals])

	// Update button text when messages change for subtasks in resume_task state
	useEffect(() => {
		if (mirrorAsk === "resume_task" && currentTaskItem?.parentTaskId) {
			const hasCompletionResult = messages.some(
				(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
			)
			if (hasCompletionResult) {
				setPrimaryButtonText(undefined)
				setSecondaryButtonText(undefined)
			}
		}
	}, [mirrorAsk, currentTaskItem?.parentTaskId, messages, t])

	useEffect(() => {
		if (messages.length === 0) {
			setSendingDisabled(false)
			setMirrorAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		}
	}, [messages.length])

	// Reset UI states when task changes
	useEffect(() => {
		setExpandedRows({})
		everVisibleMessagesTsRef.current.clear()
		setCurrentFollowUpTs(null)
		setIsCondensing(false)

		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}
		userRespondedRef.current = false
	}, [task?.ts])

	const taskTs = task?.ts

	// Request aggregated costs when task changes and has childIds
	useEffect(() => {
		if (taskTs && currentTaskItem?.childIds && currentTaskItem.childIds.length > 0) {
			vscode.postMessage({
				type: "getTaskWithAggregatedCosts",
				text: currentTaskItem.id,
			})
		}
	}, [taskTs, currentTaskItem?.id, currentTaskItem?.childIds])

	useEffect(() => {
		if (isHidden) {
			everVisibleMessagesTsRef.current.clear()
		}
	}, [isHidden])

	useEffect(() => {
		const cache = everVisibleMessagesTsRef.current
		return () => {
			cache.clear()
		}
	}, [])

	// ── Computed values ──
	const isStreaming = useMemo(() => {
		const isLastAsk = !!modifiedMessages.at(-1)?.ask
		const isToolCurrentlyAsking =
			isLastAsk && mirrorAsk !== undefined && enableButtons && primaryButtonText !== undefined

		if (isToolCurrentlyAsking) {
			return false
		}

		const isLastMessagePartial = modifiedMessages.at(-1)?.partial === true

		if (isLastMessagePartial) {
			return true
		} else {
			const lastApiReqStarted = findLast(
				modifiedMessages,
				(message: MirrorMessage) => message.say === "api_req_started",
			)

			if (
				lastApiReqStarted &&
				lastApiReqStarted.text !== null &&
				lastApiReqStarted.text !== undefined &&
				lastApiReqStarted.say === "api_req_started"
			) {
				const cost = JSON.parse(lastApiReqStarted.text).cost

				if (cost === undefined) {
					return true
				}
			}
		}

		return false
	}, [modifiedMessages, mirrorAsk, enableButtons, primaryButtonText])

	const messageWillQueue = useMemo(() => {
		if (!(inputValue.trim() || selectedImages.length > 0)) {
			return false
		}
		const isRespondingToAsk = mirrorAsk !== undefined && mirrorAsk !== "command" && mirrorAsk !== "command_output"
		if (isRespondingToAsk) {
			return false
		}
		return sendingDisabled || isStreaming || messageQueue.length > 0 || mirrorAsk !== undefined
	}, [inputValue, selectedImages, mirrorAsk, sendingDisabled, isStreaming, messageQueue.length])

	const modelActivity = useMemo((): ModelActivity => {
		if (!isStreaming) {
			return "idle"
		}

		const lastMsg = modifiedMessages.at(-1)
		if (lastMsg?.partial && lastMsg.ask === "tool") {
			try {
				const tool = JSON.parse(lastMsg.text || "{}")
				if (
					tool.tool === "readFile" ||
					tool.tool === "listFilesTopLevel" ||
					tool.tool === "listFilesRecursive"
				) {
					return "reading"
				}
			} catch {
				// ignore
			}
		}

		const lastApiReqStarted = findLast(
			modifiedMessages,
			(message: MirrorMessage) => message.say === "api_req_started",
		)
		if (
			lastApiReqStarted &&
			lastApiReqStarted.text !== null &&
			lastApiReqStarted.text !== undefined &&
			lastApiReqStarted.say === "api_req_started"
		) {
			try {
				const cost = JSON.parse(lastApiReqStarted.text).cost
				if (cost === undefined) {
					return "thinking"
				}
			} catch {
				return "thinking"
			}
		}

		return "writing"
	}, [isStreaming, modifiedMessages])

	// Sync sendingDisabled with streaming state
	useEffect(() => {
		if (!isStreaming && mirrorAsk === undefined && messages.length > 0) {
			setSendingDisabled(false)
		}
	}, [isStreaming, mirrorAsk, messages.length])

	// ── Callbacks ──
	const markFollowUpAsAnswered = useCallback(() => {
		const lastFollowUpMessage = messagesRef.current.findLast((msg: MirrorMessage) => msg.ask === "followup")
		if (lastFollowUpMessage) {
			setCurrentFollowUpTs(lastFollowUpMessage.ts)
		}
	}, [])

	const handleChatReset = useCallback(() => {
		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}
		userRespondedRef.current = false

		setInputValue("")
		setSendingDisabled(true)
		setSelectedImages([])
		setMirrorAsk(undefined)
		setEnableButtons(false)
		setOptimisticQueue([])
	}, [])

	const handleSendMessage = useCallback(
		(text: string, images: string[], forceSend: boolean = false) => {
			text = text.trim()

			if (text || images.length > 0) {
				if (apiConfiguration?.apiProvider && isRetiredProvider(apiConfiguration.apiProvider)) {
					setShowRetiredProviderWarning(true)
					return
				}

				const isRespondingToAsk =
					mirrorAskRef.current !== undefined &&
					mirrorAskRef.current !== "command" &&
					mirrorAskRef.current !== "command_output"
				// If the chat is empty (first message in a new tab), never queue —
				// send directly as a newTask. The queue check below can false-positive
				// because handleChatReset() sets sendingDisabled=true when the idle
				// tab is created, before the user has typed anything.
				const isFirstMessageInTab = messagesRef.current.length === 0
				if (
					!forceSend &&
					!isRespondingToAsk &&
					!isFirstMessageInTab &&
					(sendingDisabled || isStreaming || messageQueue.length > 0 || mirrorAskRef.current !== undefined)
				) {
					try {
						console.log("queueMessage", text, images)
						vscode.postMessage({ type: "queueMessage", text, images })

						setOptimisticQueue((prev) => [
							...prev,
							{
								timestamp: Date.now(),
								id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
								text,
								images: images.length > 0 ? images : undefined,
							},
						])

						setInputValue("")
						setSelectedImages([])
					} catch (error) {
						console.error(
							`Failed to queue message: ${error instanceof Error ? error.message : String(error)}`,
						)
					}

					return
				}

				userRespondedRef.current = true

				if (messagesRef.current.length === 0) {
					vscode.postMessage({ type: "newTask", text, images, sessionMode: "continueOrCreate" })
				} else if (mirrorAskRef.current) {
					if (mirrorAskRef.current === "followup") {
						markFollowUpAsAnswered()
					}

					switch (mirrorAskRef.current) {
						case "followup":
						case "tool":
						case "command":
						case "use_mcp_server":
						case "completion_result":
						case "resume_task":
						case "resume_completed_task":
						case "mistake_limit_reached":
							vscode.postMessage({
								type: "askResponse",
								askResponse: "messageResponse",
								text,
								images,
							})
							break
					}
				} else {
					vscode.postMessage({ type: "askResponse", askResponse: "messageResponse", text, images })
				}

				handleChatReset()
			}
		},
		[
			handleChatReset,
			markFollowUpAsAnswered,
			sendingDisabled,
			isStreaming,
			messageQueue.length,
			apiConfiguration?.apiProvider,
		],
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[]) => {
			let newValue = text

			if (inputValue !== "") {
				newValue = inputValue + " " + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	const handleStopTask = useCallback(() => {
		vscode.postMessage({ type: "cancelTask" })
		setDidClickCancel(true)
	}, [setDidClickCancel])

	const handleEnqueueCurrentMessage = useCallback(() => {
		const text = inputValue.trim()
		if (text || selectedImages.length > 0) {
			vscode.postMessage({
				type: "queueMessage",
				text,
				images: selectedImages,
			})

			setOptimisticQueue((prev) => [
				...prev,
				{
					timestamp: Date.now(),
					id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
					text,
					images: selectedImages.length > 0 ? selectedImages : undefined,
				},
			])

			setInputValue("")
			setSelectedImages([])
		}
	}, [inputValue, selectedImages])

	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			userRespondedRef.current = true

			const trimmedInput = text?.trim()

			switch (mirrorAsk) {
				case "api_req_failed":
				case "command":
				case "tool":
				case "use_mcp_server":
				case "mistake_limit_reached":
					vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					break
				case "resume_task":
					const isCompletedSubtaskForClick =
						currentTaskItem?.parentTaskId &&
						messagesRef.current.some(
							(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
						)
					if (!isCompletedSubtaskForClick) {
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					break
				case "completion_result":
				case "resume_completed_task":
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "queueMessage",
							text: trimmedInput || "",
							images: images || [],
						})

						setOptimisticQueue((prev) => [
							...prev,
							{
								timestamp: Date.now(),
								id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
								text: trimmedInput || "",
								images: images && images.length > 0 ? images : undefined,
							},
						])

						setInputValue("")
						setSelectedImages([])
					}
					break
			}

			setSendingDisabled(true)
			setMirrorAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText(undefined)
			setSecondaryButtonText(undefined)
		},
		[mirrorAsk, currentTaskItem?.parentTaskId],
	)

	const handleSecondaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			userRespondedRef.current = true

			const trimmedInput = text?.trim()

			if (isStreaming) {
				vscode.postMessage({ type: "cancelTask" })
				setDidClickCancel(true)
				return
			}

			switch (mirrorAsk) {
				case "api_req_failed":
				case "mistake_limit_reached":
				case "resume_task":
					break
				case "command":
				case "tool":
				case "use_mcp_server":
					vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "abort" })
					break
			}
			setSendingDisabled(true)
			setMirrorAsk(undefined)
			setEnableButtons(false)
		},
		[mirrorAsk, isStreaming, setDidClickCancel],
	)

	// ── Model picker ──
	const { id: modelId, info: model } = useSelectedModel(apiConfiguration)

	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	const shouldDisableImages = selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	// Uses the passed-in setApiConfiguration from ExtensionStateContext
	const setApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			if (apiConfiguration) {
				setApiConfiguration({ ...apiConfiguration, [field]: value })
			}
		},
		[apiConfiguration, setApiConfiguration],
	)

	const provider = apiConfiguration?.apiProvider as ProviderName | undefined

	const modelPickerConfig = useMemo<{
		modelIdKey:
			| "apiModelId"
			| "openRouterModelId"
			| "requestyModelId"
			| "unboundModelId"
			| "litellmModelId"
			| "vercelAiGatewayModelId"
			| "openAiModelId"
			| "ollamaModelId"
			| "lmStudioModelId"
			| "vsCodeLmModelSelector"
			| "customModelId"
		models: Record<string, ModelInfo> | null
		defaultModelId: string
		serviceName: string
		serviceUrl: string
	} | null>(() => {
		if (!provider || isRetiredProvider(provider)) return null

		const routerModelConfigs: Record<
			string,
			{
				modelIdKey:
					| "openRouterModelId"
					| "requestyModelId"
					| "unboundModelId"
					| "litellmModelId"
					| "vercelAiGatewayModelId"
				routerKey: string
			}
		> = {
			openrouter: { modelIdKey: "openRouterModelId", routerKey: "openrouter" },
			requesty: { modelIdKey: "requestyModelId", routerKey: "requesty" },
			unbound: { modelIdKey: "unboundModelId", routerKey: "unbound" },
			litellm: { modelIdKey: "litellmModelId", routerKey: "litellm" },
			"vercel-ai-gateway": { modelIdKey: "vercelAiGatewayModelId", routerKey: "vercel-ai-gateway" },
		}

		if (provider in routerModelConfigs) {
			const config = routerModelConfigs[provider]
			const providerModels = (routerModels as RouterModels | undefined)?.[
				config.routerKey as keyof RouterModels
			] as Record<string, ModelInfo> | undefined
			return {
				modelIdKey: config.modelIdKey,
				models: providerModels ?? null,
				defaultModelId: getDefaultModelIdForProvider(provider),
				serviceName: getProviderServiceConfig(provider).serviceName,
				serviceUrl: getProviderServiceConfig(provider).serviceUrl,
			}
		}

		if (provider === "poe") {
			return {
				modelIdKey: "apiModelId" as const,
				models: (routerModels as RouterModels | undefined)?.poe ?? null,
				defaultModelId: "",
				serviceName: "Poe",
				serviceUrl: "https://poe.com",
			}
		}

		if (provider === "vscode-lm") {
			return {
				modelIdKey: "vsCodeLmModelSelector" as const,
				models: null,
				defaultModelId: "",
				serviceName: "VS Code LM",
				serviceUrl: "",
			}
		}

		if (provider === "custom") {
			return {
				modelIdKey: "customModelId" as const,
				models: null,
				defaultModelId: "",
				serviceName: "Custom API",
				serviceUrl: "",
			}
		}

		if (provider === "openai") {
			return {
				modelIdKey: "openAiModelId",
				models: null,
				defaultModelId: "",
				serviceName: "OpenAI Compatible",
				serviceUrl: "",
			}
		}

		const staticModels = MODELS_BY_PROVIDER[provider]
		if (staticModels) {
			return {
				modelIdKey: "apiModelId",
				models: staticModels,
				defaultModelId: getDefaultModelIdForProvider(provider, apiConfiguration),
				serviceName: getProviderServiceConfig(provider).serviceName,
				serviceUrl: getProviderServiceConfig(provider).serviceUrl,
			}
		}

		return null
	}, [provider, apiConfiguration, routerModels])

	const modelOptions = useMemo(() => {
		if (!modelPickerConfig?.models) return undefined
		const builtIn = Object.keys(modelPickerConfig.models)
		let custom: string[] = []
		try {
			const saved = localStorage.getItem(
				`custom_models_${apiConfiguration?.apiProvider}_${modelPickerConfig.modelIdKey}`,
			)
			if (saved) {
				custom = JSON.parse(saved)
			}
		} catch {}
		let deleted: string[] = []
		try {
			const saved = localStorage.getItem(
				`deleted_models_${apiConfiguration?.apiProvider}_${modelPickerConfig.modelIdKey}`,
			)
			if (saved) {
				deleted = JSON.parse(saved)
			}
		} catch {}
		const allKeys = [...new Set([...builtIn, ...custom])].filter((key) => !deleted.includes(key))
		return allKeys.map((key) => ({ value: key, label: key }))
	}, [modelPickerConfig?.models, modelPickerConfig?.modelIdKey, apiConfiguration?.apiProvider, apiConfiguration])

	const handleModelChange = useCallback(
		(newModelId: string) => {
			if (modelPickerConfig) {
				setApiConfigurationField(modelPickerConfig.modelIdKey, newModelId)
				vscode.postMessage({
					type: "modelChange",
					apiConfiguration: {
						...apiConfiguration,
						[modelPickerConfig.modelIdKey]: newModelId,
					},
				})
			}
		},
		[modelPickerConfig, setApiConfigurationField, apiConfiguration],
	)

	// ── Message handler (window event) ──
	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden) {
								if (sendingDisabled && !isStreaming && mirrorAsk === undefined) {
									setSendingDisabled(false)
								}
								if (!sendingDisabled && !enableButtons) {
									textAreaRef.current?.focus()
								}
							}
							break
						case "focusInput":
							textAreaRef.current?.focus()
							break
					}
					break
				case "selectedImages":
					if (message.context !== "edit") {
						setSelectedImages((prevImages: string[]) =>
							appendImages(prevImages, message.images, MAX_IMAGES_PER_MESSAGE),
						)
					}
					break
				case "invoke":
					switch (message.invoke!) {
						case "newChat":
							handleChatReset()
							break
						case "sendMessage":
							handleSendMessage(message.text ?? "", message.images ?? [])
							break
						case "setChatBoxMessage":
							handleSetChatBoxMessage(message.text ?? "", message.images ?? [])
							break
						case "primaryButtonClick":
							handlePrimaryButtonClick(message.text ?? "", message.images ?? [])
							break
						case "secondaryButtonClick":
							handleSecondaryButtonClick(message.text ?? "", message.images ?? [])
							break
					}
					break
				case "condenseTaskContextStarted":
					if (message.text) {
						setIsCondensing(true)
					}
					break
				case "condenseTaskContextResponse":
					if (message.text) {
						if (isCondensing && sendingDisabled) {
							setSendingDisabled(false)
						}
						setIsCondensing(false)
					}
					break
				case "checkpointInitWarning":
					setCheckpointWarning(message.checkpointWarning)
					break
				case "interactionRequired":
					playSound("notification")
					break
				case "taskWithAggregatedCosts":
					if (message.text && message.aggregatedCosts) {
						setAggregatedCostsMap((prev) => {
							const newMap = new Map(prev)
							newMap.set(message.text!, message.aggregatedCosts!)
							return newMap
						})
					}
					break
			}
		},
		[
			isCondensing,
			isHidden,
			sendingDisabled,
			enableButtons,
			isStreaming,
			mirrorAsk,
			handleChatReset,
			handleSendMessage,
			handleSetChatBoxMessage,
			handlePrimaryButtonClick,
			handleSecondaryButtonClick,
			setCheckpointWarning,
			playSound,
		],
	)

	useEvent("message", handleMessage)

	// ── Message filtering & grouping ──
	const visibleMessages = useMemo(() => {
		const userMessageCheckpointHashes = new Set<string>()
		modifiedMessages.forEach((msg) => {
			if (
				msg.say === "user_feedback" &&
				msg.checkpoint &&
				msg.checkpoint["type"] === "user_message" &&
				msg.checkpoint["hash"]
			) {
				userMessageCheckpointHashes.add(msg.checkpoint["hash"] as string)
			}
		})

		const newVisibleMessages = modifiedMessages.filter((message) => {
			if (message.say === "checkpoint_saved") {
				if (
					message.checkpoint &&
					typeof message.checkpoint === "object" &&
					"suppressMessage" in message.checkpoint &&
					message.checkpoint.suppressMessage
				) {
					return false
				}
				if (message.text && userMessageCheckpointHashes.has(message.text)) {
					return false
				}
			}

			if (everVisibleMessagesTsRef.current.has(message.ts)) {
				const alwaysHiddenOnceProcessedAsk: MirrorAsk[] = [
					"api_req_failed",
					"resume_task",
					"resume_completed_task",
				]
				const alwaysHiddenOnceProcessedSay = [
					"api_req_finished",
					"api_req_retried",
					"api_req_deleted",
					"mcp_server_request_started",
				]
				if (message.ask && alwaysHiddenOnceProcessedAsk.includes(message.ask)) return false
				if (message.say && alwaysHiddenOnceProcessedSay.includes(message.say)) return false
				if (message.say === "text" && (message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
					return false
				}
				return true
			}

			switch (message.ask) {
				case "completion_result":
					if (message.text === "") return false
					break
				case "api_req_failed":
				case "resume_task":
				case "resume_completed_task":
					return false
			}
			switch (message.say) {
				case "api_req_finished":
				case "api_req_retried":
				case "api_req_deleted":
					return false
				case "api_req_retry_delayed":
				case "api_req_rate_limit_wait":
					const last1 = modifiedMessages.at(-1)
					const last2 = modifiedMessages.at(-2)
					if (last1?.ask === "resume_task" && last2 === message) {
						return true
					} else if (message !== last1) {
						return false
					}
					break
				case "text":
					if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) return false
					break
				case "mcp_server_request_started":
					return false
			}
			return true
		})

		const viewportStart = Math.max(0, newVisibleMessages.length - 100)
		newVisibleMessages
			.slice(viewportStart)
			.forEach((msg: MirrorMessage) => everVisibleMessagesTsRef.current.set(msg.ts, true))

		return newVisibleMessages
	}, [modifiedMessages])

	// LRU cache cleanup interval
	useEffect(() => {
		const cleanupInterval = setInterval(() => {
			const cache = everVisibleMessagesTsRef.current
			const currentMessageIds = new Set(modifiedMessages.map((m: MirrorMessage) => m.ts))
			const viewportMessages = visibleMessages.slice(Math.max(0, visibleMessages.length - 100))
			const viewportMessageIds = new Set(viewportMessages.map((m: MirrorMessage) => m.ts))

			cache.forEach((_value: boolean, key: number) => {
				if (!currentMessageIds.has(key) && !viewportMessageIds.has(key)) {
					cache.delete(key)
				}
			})
		}, 60000)

		return () => clearInterval(cleanupInterval)
	}, [modifiedMessages, visibleMessages])

	useDebounceEffect(
		() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		},
		50,
		[isHidden, sendingDisabled, enableButtons],
	)

	// TTS effect
	useEffect(() => {
		if (lastMessage && messages.length > 1) {
			if (
				typeof lastMessage.text === "string" &&
				(lastMessage.say === "text" || lastMessage.say === "completion_result") &&
				!lastMessage.partial &&
				!lastMessage.text.startsWith("{")
			) {
				let text = lastMessage?.text || ""
				const mermaidRegex = /```mermaid[\s\S]*?```/g
				text = text.replace(mermaidRegex, "")
				text = removeMd(text)

				if (text !== lastTtsRef.current) {
					try {
						playTts(text)
						lastTtsRef.current = text
					} catch (error) {
						console.error("Failed to execute text-to-speech:", error)
					}
				}
			}
		}

		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, messages.length])

	const latestUserMessage = useMemo(() => {
		for (let i = visibleMessages.length - 1; i >= 0; i--) {
			const msg = visibleMessages[i]
			if (msg.say === "user_feedback" && msg.text) {
				return msg
			}
		}
		return null
	}, [visibleMessages])

	const groupedMessages = useMemo(() => {
		const filtered: MirrorMessage[] = visibleMessages

		const isReadFileAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return tool.tool === "readFile" && !tool.batchFiles
			} catch {
				return false
			}
		}

		const isListFilesAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return (tool.tool === "listFilesTopLevel" || tool.tool === "listFilesRecursive") && !tool.batchDirs
			} catch {
				return false
			}
		}

		const editFileTools = new Set([
			"editedExistingFile",
			"appliedDiff",
			"newFileCreated",
			"insertContent",
			"searchAndReplace",
		])

		const isEditFileAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return editFileTools.has(tool.tool) && !tool.batchDiffs
			} catch {
				return false
			}
		}

		const synthesizeReadFileBatch = (batch: MirrorMessage[]): MirrorMessage => {
			const batchFiles = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						lineSnippet: tool.reason || "",
						isOutsideWorkspace: tool.isOutsideWorkspace || false,
						key: `${tool.path}${tool.reason ? ` (${tool.reason})` : ""}`,
						content: tool.content || "",
					}
				} catch {
					return { path: "", lineSnippet: "", key: "", content: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchFiles }),
			}
		}

		const synthesizeListFilesBatch = (batch: MirrorMessage[]): MirrorMessage => {
			const batchDirs = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						recursive: tool.tool === "listFilesRecursive",
						isOutsideWorkspace: tool.isOutsideWorkspace || false,
						key: tool.path || "",
					}
				} catch {
					return { path: "", recursive: false, key: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchDirs }),
			}
		}

		const synthesizeEditFileBatch = (batch: MirrorMessage[]): MirrorMessage => {
			const batchDiffs = batch.map((batchMsg) => {
				try {
					const tool = JSON.parse(batchMsg.text || "{}")
					return {
						path: tool.path || "",
						changeCount: 1,
						key: tool.path || "",
						content: tool.content || tool.diff || "",
						diffStats: tool.diffStats,
					}
				} catch {
					return { path: "", changeCount: 0, key: "", content: "" }
				}
			})

			let firstTool
			try {
				firstTool = JSON.parse(batch[0].text || "{}")
			} catch {
				return batch[0]
			}
			return {
				...batch[0],
				text: JSON.stringify({ ...firstTool, batchDiffs }),
			}
		}

		const readFileBatched = batchConsecutive(filtered, isReadFileAsk, synthesizeReadFileBatch)
		const listFilesBatched = batchConsecutive(readFileBatched, isListFilesAsk, synthesizeListFilesBatch)
		const result = batchConsecutive(listFilesBatched, isEditFileAsk, synthesizeEditFileBatch)

		if (isCondensing) {
			result.push({
				type: "say",
				say: "condense_context",
				ts: Date.now(),
				partial: true,
			} as MirrorMessage)
		}
		return result
	}, [isCondensing, visibleMessages])

	const displayedMessages = useMemo(() => {
		if (groupedMessages.length <= messageLimit) {
			return groupedMessages
		}
		return groupedMessages.slice(groupedMessages.length - messageLimit)
	}, [groupedMessages, messageLimit])

	const userFeedbackIndices = useMemo(() => {
		const indices: number[] = []
		for (let i = 0; i < displayedMessages.length; i++) {
			if (displayedMessages[i]?.say === "user_feedback") {
				indices.push(i)
			}
		}
		return indices
	}, [displayedMessages])

	const [stickyUserIndex, setStickyUserIndex] = useState<number | null>(() => {
		if (userFeedbackIndices.length > 0) {
			return userFeedbackIndices[userFeedbackIndices.length - 1]
		}
		return null
	})

	const stickyUserIndexRef = useRef(stickyUserIndex)
	stickyUserIndexRef.current = stickyUserIndex
	const displayedMessagesRef = useRef(displayedMessages)
	displayedMessagesRef.current = displayedMessages

	useEffect(() => {
		if (userFeedbackIndices.length > 0) {
			setStickyUserIndex(userFeedbackIndices[userFeedbackIndices.length - 1])
		} else {
			setStickyUserIndex(null)
		}
	}, [userFeedbackIndices])

	const handleRangeChanged = useCallback((_range: { startIndex: number; endIndex: number }) => {
		// Intentionally no-op
	}, [])

	const virtuosoComponents = useMemo(
		() => ({
			Item: ({ children, ...props }: any) => {
				const index = props["data-index"]
				const msgs = displayedMessagesRef.current
				const msg = msgs[index]
				const isStickyUser = msg?.say === "user_feedback" && index === stickyUserIndexRef.current

				const customStyle = {
					...props.style,
					...(isStickyUser
						? {
								position: "sticky" as const,
								top: 0,
								zIndex: 1,
								background: "var(--vscode-sideBar-background)",
							}
						: {}),
				}

				return (
					<div {...props} style={customStyle}>
						{children}
					</div>
				)
			},
		}),
		[],
	)

	const checkpointIndices = useMemo(() => {
		const indices: number[] = []
		for (let i = 0; i < displayedMessages.length; i++) {
			if (displayedMessages[i]?.say === "checkpoint_saved") {
				indices.push(i)
			}
		}
		return indices
	}, [displayedMessages])

	const hasLatestCheckpoint = checkpointIndices.length > 0
	const checkpointJumpCursorRef = useRef<number | null>(null)

	useEffect(() => {
		checkpointJumpCursorRef.current = null
	}, [task?.ts, checkpointIndices])

	// Row expansion — detect user-expanded rows and notify ChatView via callback
	useEffect(() => {
		const prev = prevExpandedRowsRef.current
		let wasAnyRowExpandedByUser = false
		if (prev) {
			for (const [tsKey, isExpanded] of Object.entries(expandedRows)) {
				const ts = Number(tsKey)
				if (isExpanded && !(prev[ts] ?? false)) {
					wasAnyRowExpandedByUser = true
					break
				}
			}
		}

		if (wasAnyRowExpandedByUser) {
			onUserExpandedRow?.("row-expansion")
		}

		prevExpandedRowsRef.current = expandedRows
	}, [expandedRows, onUserExpandedRow])

	const handleSetExpandedRow = useCallback(
		(ts: number, expand?: boolean) => {
			setExpandedRows((prev: Record<number, boolean>) => ({
				...prev,
				[ts]: expand === undefined ? !prev[ts] : expand,
			}))
		},
		[setExpandedRows],
	)

	const toggleRowExpansion = useCallback(
		(ts: number) => {
			handleSetExpandedRow(ts)
		},
		[handleSetExpandedRow],
	)

	// Clear checkpoint warning when messages appear or task changes
	useEffect(() => {
		if (isHidden || !task) {
			setCheckpointWarning(undefined)
		}
	}, [modifiedMessages.length, isStreaming, isHidden, task])

	const placeholderText = task ? t("chat:typeMessage") : t("chat:typeTask")

	// ── Mode switching ──
	const switchToMode = useCallback(
		(modeSlug: string): void => {
			setMode(modeSlug)
			vscode.postMessage({ type: "mode", text: modeSlug })
		},
		[setMode],
	)

	const handleSuggestionClickInRow = useCallback(
		(suggestion: SuggestionItem, event?: React.MouseEvent) => {
			if (event) {
				userRespondedRef.current = true
			}

			if (mirrorAsk === "followup" && !event?.shiftKey) {
				markFollowUpAsAnswered()
			}

			if (suggestion.mode) {
				const isManualClick = !!event
				if (isManualClick) {
					switchToMode(suggestion.mode)
				}
			}

			if (event?.shiftKey) {
				setInputValue((currentValue: string) => {
					return currentValue !== "" ? `${currentValue} \n${suggestion.answer}` : suggestion.answer
				})
			} else {
				const preservedInput = inputValueRef.current
				handleSendMessage(suggestion.answer, [])
				setInputValue(preservedInput)
			}
		},
		[handleSendMessage, setInputValue, switchToMode, mirrorAsk, markFollowUpAsAnswered],
	)

	const handleBatchFileResponse = useCallback((response: { [key: string]: boolean }) => {
		vscode.postMessage({ type: "askResponse", askResponse: "objectResponse", text: JSON.stringify(response) })
	}, [])

	const handleFollowUpUnmount = useCallback(() => {
		vscode.postMessage({ type: "cancelAutoApproval" })
	}, [])

	const handleScrollToBottomAndResetCheckpointCursor = useCallback(() => {
		checkpointJumpCursorRef.current = null
		// ChatView wraps this with handleScrollToBottomClick from useScrollLifecycle
		// via the onScrollToBottomClick option if needed
	}, [])

	const handleScrollToLatestCheckpoint = useCallback(() => {
		if (checkpointIndices.length === 0) {
			return
		}

		const previousCursor = checkpointJumpCursorRef.current
		const nextCursor = previousCursor === null ? checkpointIndices.length - 1 : Math.max(0, previousCursor - 1)
		const nextCheckpointIndex = checkpointIndices[nextCursor]
		checkpointJumpCursorRef.current = nextCursor

		virtuosoRef.current?.scrollToIndex({
			index: nextCheckpointIndex,
			align: "center",
			behavior: "smooth",
		})
	}, [checkpointIndices])

	const handleNavigateToMessage = useCallback(
		(ts: number) => {
			const messageIndex = displayedMessages.findIndex((msg) => msg.ts === ts)
			if (messageIndex >= 0) {
				virtuosoRef.current?.scrollToIndex({
					index: messageIndex,
					align: "center",
					behavior: "smooth",
				})
			}
		},
		[displayedMessages],
	)

	// Keyboard shortcuts
	const switchToNextMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const nextModeIndex = (currentModeIndex + 1) % allModes.length
		switchToMode(allModes[nextModeIndex].slug)
	}, [mode, customModes, switchToMode])

	const switchToPreviousMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const previousModeIndex = (currentModeIndex - 1 + allModes.length) % allModes.length
		switchToMode(allModes[previousModeIndex].slug)
	}, [mode, customModes, switchToMode])

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === ".") {
				event.preventDefault()
				if (event.shiftKey) {
					switchToPreviousMode()
				} else {
					switchToNextMode()
				}
			}
		},
		[switchToNextMode, switchToPreviousMode],
	)

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown)

		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [handleKeyDown])

	// Condense context
	const handleCondenseContext = (taskId: string) => {
		if (isCondensing || sendingDisabled) {
			return
		}
		setIsCondensing(true)
		setSendingDisabled(true)
		vscode.postMessage({ type: "condenseTaskContextRequest", text: taskId })
	}

	// ── Return everything ──
	return {
		virtuosoRef,
		scrollContainerRef,
		textAreaRef,
		inputValueRef,
		stickyUserIndexRef,
		displayedMessagesRef,
		checkpointJumpCursorRef,
		mirrorAskRef,

		inputValue,
		setInputValue,
		selectedImages,
		setSelectedImages,
		currentFollowUpTs,
		modeShortcutText,
		sendingDisabled,
		setSendingDisabled,
		mirrorAsk,
		setMirrorAsk,
		enableButtons,
		primaryButtonText,
		secondaryButtonText,
		expandedRows,
		activeHeaderPanel,
		setActiveHeaderPanel,
		checkpointWarning,
		isCondensing,
		isFollowUpAutoApprovalPaused,
		isProfileDisabled,
		optimisticQueue,
		effectiveQueue,
		showRetiredProviderWarning,
		setShowRetiredProviderWarning,
		aggregatedCostsMap,
		stickyUserIndex,
		showAnnouncementModal,
		setShowAnnouncementModal,
		messageLimit,
		setMessageLimit,

		task,
		latestTodos,
		apiMetrics,
		modifiedMessages,
		visibleMessages,
		groupedMessages,
		displayedMessages,
		userFeedbackIndices,
		checkpointIndices,
		hasLatestCheckpoint,
		isStreaming,
		messageWillQueue,
		modelActivity,
		lastMessage,
		modelPickerConfig,
		modelOptions,
		modelId,
		model,
		latestUserMessage,
		placeholderText,
		shouldDisableImages,

		handleSendMessage,
		handleSetChatBoxMessage,
		handleStopTask,
		handleEnqueueCurrentMessage,
		handlePrimaryButtonClick,
		handleSecondaryButtonClick,
		handleSetExpandedRow,
		toggleRowExpansion,
		handleCondenseContext,
		markFollowUpAsAnswered,
		handleChatReset,
		handleModelChange,
		switchToMode,
		handleSuggestionClickInRow,
		handleBatchFileResponse,
		handleFollowUpUnmount,
		playSound,
		handleScrollToBottomAndResetCheckpointCursor,
		handleScrollToLatestCheckpoint,
		handleNavigateToMessage,
		handleRangeChanged,
		virtuosoComponents,
	}
}
