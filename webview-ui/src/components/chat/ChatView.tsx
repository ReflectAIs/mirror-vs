import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useDeepCompareEffect, useEvent } from "react-use"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import removeMd from "remove-markdown"
import useSound from "use-sound"
import { LRUCache } from "lru-cache"

import type { ModelActivity } from "@src/components/welcome/MirrorHero"

import { useDebounceEffect } from "@src/utils/useDebounceEffect"
import { appendImages } from "@src/utils/imageUtils"
import { getCostBreakdownIfNeeded } from "@src/utils/costFormatting"
import { batchConsecutive } from "@src/utils/batchConsecutive"

import type {
	MirrorAsk,
	MirrorSayTool,
	MirrorMessage,
	ExtensionMessage,
	AudioType,
	ProviderSettings,
	ModelInfo,
} from "@mirror-vs/types"
import {
	isRetiredProvider,
	openRouterDefaultModelId,
	requestyDefaultModelId,
	unboundDefaultModelId,
	litellmDefaultModelId,
	vercelAiGatewayDefaultModelId,
	poeDefaultModelId,
	vscodeLlmModels,
	vscodeLlmDefaultModelId,
	customDefaultModelId,
	customDefaultModelInfo,
	type ProviderName,
	type RouterModels,
} from "@mirror-vs/types"

import { findLast, findLastIndex } from "@shared/array"
import { SuggestionItem } from "@mirror-vs/types"
import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import { getApiMetrics } from "@shared/getApiMetrics"
import { getAllModes } from "@shared/modes"
import { ProfileValidator } from "@shared/ProfileValidator"
import { getLatestTodo } from "@shared/todo"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"
import MirrorHero from "@src/components/welcome/MirrorHero"
import MirrorTips from "@src/components/welcome/MirrorTips"
import { StandardTooltip, Button } from "@src/components/ui"
import {
	getDefaultModelIdForProvider,
	getProviderServiceConfig,
	getStaticModelsForProvider,
} from "../settings/utils/providerModelConfig"
import { MODELS_BY_PROVIDER } from "../settings/constants"
import Announcement from "./Announcement"
import ChatRow from "./ChatRow"
import WarningRow from "./WarningRow"
import { ChatTextArea } from "./ChatTextArea"
import { TodoListDisplay } from "./TodoListDisplay"
import TaskHeader from "./TaskHeader"
import ProfileViolationWarning from "./ProfileViolationWarning"
import { CheckpointWarning } from "./CheckpointWarning"
import { QueuedMessages } from "./QueuedMessages"
import { WorktreeSelector } from "./WorktreeSelector"
import FileChangesPanel from "./FileChangesPanel"
import { useScrollLifecycle } from "@src/hooks/useScrollLifecycle"
import { FoldVertical, HardDriveDownload, HardDriveUpload, ListTodo } from "lucide-react"
import { getModelMaxOutputTokens } from "@shared/api"
import { formatLargeNumber } from "@src/utils/format"
import { ContextWindowProgress } from "./ContextWindowProgress"

export interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

export interface ChatViewRef {
	acceptInput: () => void
}

export const MAX_IMAGES_PER_MESSAGE = 20 // This is the Anthropic limit.

const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0

const ChatViewComponent: React.ForwardRefRenderFunction<ChatViewRef, ChatViewProps> = (
	{ isHidden, showAnnouncement, hideAnnouncement },
	ref,
) => {
	const [audioBaseUri] = useState(() => {
		return (window as unknown as { AUDIO_BASE_URI?: string }).AUDIO_BASE_URI || ""
	})

	const { t } = useAppTranslation()
	const modeShortcutText = `${isMac ? "⌘" : "Ctrl"} + . ${t("chat:forNextMode")}, ${isMac ? "⌘" : "Ctrl"} + Shift + . ${t("chat:forPreviousMode")}`

	const {
		mirrorMessages: messages,
		currentTaskItem,
		currentTaskTodos,
		taskHistory,
		apiConfiguration,
		organizationAllowList,
		mode,
		setMode,
		alwaysAllowModeSwitch,
		customModes,
		soundEnabled,
		soundVolume,
		messageQueue = [],
		showWorktreesInHomeScreen,
		setApiConfiguration,
		routerModels,
	} = useExtensionState()

	// Show a WarningRow when the user sends a message with a retired provider.
	const [showRetiredProviderWarning, setShowRetiredProviderWarning] = useState(false)
	const [activeHeaderPanel, setActiveHeaderPanel] = useState<"stats" | "todos" | "none">("none")
	const [messageLimit, setMessageLimit] = useState(120)

	// When the provider changes, clear the retired-provider warning.
	const providerName = apiConfiguration?.apiProvider
	useEffect(() => {
		setShowRetiredProviderWarning(false)
	}, [providerName])

	const messagesRef = useRef(messages)

	useEffect(() => {
		messagesRef.current = messages
	}, [messages])

	// Leaving this less safe version here since if the first message is not a
	// task, then the extension is in a bad state and needs to be debugged (see
	// Mirror.abort).
	const task = useMemo(() => messages.at(0), [messages])

	const latestTodos = useMemo(() => {
		// First check if we have initial todos from the state (for new subtasks)
		if (currentTaskTodos && currentTaskTodos.length > 0) {
			// Check if there are any todo updates in messages
			const messageBasedTodos = getLatestTodo(messages)
			// If there are message-based todos, they take precedence (user has updated them)
			if (messageBasedTodos && messageBasedTodos.length > 0) {
				return messageBasedTodos
			}
			// Otherwise use the initial todos from state
			return currentTaskTodos
		}
		// Fall back to extracting from messages
		return getLatestTodo(messages)
	}, [messages, currentTaskTodos])

	const modifiedMessages = useMemo(() => combineApiRequests(combineCommandSequences(messages)), [messages])

	// Has to be after api_req_finished are all reduced into api_req_started messages.
	const apiMetrics = useMemo(() => getApiMetrics(modifiedMessages), [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const inputValueRef = useRef(inputValue)
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [sendingDisabled, setSendingDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	// We need to hold on to the ask because useEffect > lastMessage will always
	// let us know when an ask comes in and handle it, but by the time
	// handleMessage is called, the last message might not be the ask anymore
	// (it could be a say that followed).
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

	// Keep inputValueRef in sync with inputValue state
	useEffect(() => {
		inputValueRef.current = inputValue
	}, [inputValue])

	// Compute whether auto-approval is paused (user is typing in a followup)
	const isFollowUpAutoApprovalPaused = useMemo(() => {
		return !!(inputValue && inputValue.trim().length > 0 && mirrorAsk === "followup")
	}, [inputValue, mirrorAsk])

	// Cancel auto-approval timeout when user starts typing
	useEffect(() => {
		// Only send cancel if there's actual input (user is typing)
		// and we have a pending follow-up question
		if (isFollowUpAutoApprovalPaused) {
			vscode.postMessage({ type: "cancelAutoApproval" })
		}
	}, [isFollowUpAutoApprovalPaused])

	const isProfileDisabled = useMemo(
		() => !!apiConfiguration && !ProfileValidator.isProfileAllowed(apiConfiguration, organizationAllowList),
		[apiConfiguration, organizationAllowList],
	)

	// UI layout depends on the last 2 messages (since it relies on the content
	// of these messages, we are deep comparing) i.e. the button state after
	// hitting button sets enableButtons to false,  and this effect otherwise
	// would have to true again even if messages didn't change.
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	const volume = typeof soundVolume === "number" ? soundVolume : 0.5
	const [playNotification] = useSound(`${audioBaseUri}/notification.wav`, { volume, soundEnabled, interrupt: true })
	const [playCelebration] = useSound(`${audioBaseUri}/celebration.wav`, { volume, soundEnabled, interrupt: true })
	const [playProgressLoop] = useSound(`${audioBaseUri}/progress_loop.wav`, { volume, soundEnabled, interrupt: true })

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
			} // debounce: skip if played within 100ms
			lastPlayedRef.current[audioType] = now

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
		[soundEnabled, playNotification, playCelebration, playProgressLoop],
	)

	function playTts(text: string) {
		vscode.postMessage({ type: "playTts", text })
	}

	useDeepCompareEffect(() => {
		// if last message is an ask, show user ask UI
		// if user finished a task, then start a new task with a new conversation history since in this moment that the extension is waiting for user response, the user could close the extension and the conversation history would be lost.
		// basically as long as a task is active, the conversation history will be persisted
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					// Reset user response flag when a new ask arrives to allow auto-approval
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
							// setting enable buttons to `false` would trigger a focus grab when
							// the text area is enabled which is undesirable.
							// We have no buttons for this tool, so no problem having them "enabled"
							// to workaround this issue.  See #1358.
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
						case "command":
							setSendingDisabled(isPartial)
							setMirrorAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText(t("chat:runCommand.title"))
							setSecondaryButtonText(t("chat:reject.title"))
							break
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
							// Extension waiting for feedback, but we can just present a new task button.
							// Only play celebration sound if there are no queued messages.
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
							// For completed subtasks, show "Start New Task" instead of "Resume"
							// A subtask is considered completed if:
							// - It has a parentTaskId AND
							// - Its messages contain a completion_result (either ask or say)
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
							setDidClickCancel(false) // special case where we reset the cancel button state
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
					// Don't want to reset since there could be a "say" after
					// an "ask" while ask is waiting for response.
					switch (lastMessage.say) {
						case "api_req_retry_delayed":
						case "api_req_rate_limit_wait":
							setSendingDisabled(true)
							break
						case "api_req_started":
							// Clear button state when a new API request starts
							// This fixes buttons persisting when the task continues
							setSendingDisabled(true)
							// Note: Do NOT clear selectedImages here. This handler fires
							// every time the backend starts an API call, which would wipe
							// images the user has pasted while the chat is in progress.
							// Images are already cleared in the appropriate user-action
							// handlers (handleSendMessage, handlePrimaryButtonClick, etc.).
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
	}, [lastMessage, secondLastMessage])

	// Update button text when messages change (e.g., completion_result is added) for subtasks in resume_task state
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

	// Reset UI states when task changes. Scroll lifecycle is handled by
	// useScrollLifecycle which has its own effect keyed on taskTs.
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

	const isStreaming = useMemo(() => {
		// Checking mirrorAsk isn't enough since messages effect may be called
		// again for a tool for example, set mirrorAsk to its value, and if the
		// next message is not an ask then it doesn't reset. This is likely due
		// to how much more often we're updating messages as compared to before,
		// and should be resolved with optimizations as it's likely a rendering
		// bug. But as a final guard for now, the cancel button will show if the
		// last message is not an ask.
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
					return true // API request has not finished yet.
				}
			}
		}

		return false
	}, [modifiedMessages, mirrorAsk, enableButtons, primaryButtonText])

	const modelActivity = useMemo((): ModelActivity => {
		if (!isStreaming) {
			return "idle"
		}

		// Check if last partial message involves reading files
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
				// ignore parse errors
			}
		}

		// Check if API request is in progress (thinking state - waiting for response)
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

		// If we're streaming but no API request is pending, we're generating/writing
		return "writing"
	}, [isStreaming, modifiedMessages])

	const markFollowUpAsAnswered = useCallback(() => {
		const lastFollowUpMessage = messagesRef.current.findLast((msg: MirrorMessage) => msg.ask === "followup")
		if (lastFollowUpMessage) {
			setCurrentFollowUpTs(lastFollowUpMessage.ts)
		}
	}, [])

	const handleChatReset = useCallback(() => {
		// Clear any pending auto-approval timeout
		if (autoApproveTimeoutRef.current) {
			clearTimeout(autoApproveTimeoutRef.current)
			autoApproveTimeoutRef.current = null
		}
		// Reset user response flag for new message
		userRespondedRef.current = false

		// Only reset message-specific state, preserving mode.
		setInputValue("")
		setSendingDisabled(true)
		setSelectedImages([])
		setMirrorAsk(undefined)
		setEnableButtons(false)
		// Do not reset mode here as it should persist.
		// setPrimaryButtonText(undefined)
		// setSecondaryButtonText(undefined)
	}, [])

	/**
	 * Handles sending messages to the extension
	 * @param text - The message text to send
	 * @param images - Array of image data URLs to send with the message
	 */
	const handleSendMessage = useCallback(
		(text: string, images: string[]) => {
			text = text.trim()

			if (text || images.length > 0) {
				// Intercept when the active provider is retired — show a
				// WarningRow instead of sending anything to the backend.
				if (apiConfiguration?.apiProvider && isRetiredProvider(apiConfiguration.apiProvider)) {
					setShowRetiredProviderWarning(true)
					return
				}

				// Queue message if:
				// - Task is busy (sendingDisabled)
				// - API request in progress (isStreaming)
				// - Queue has items (preserve message order during drain)
				// - Command is running (command_output) - user's message should be queued for AI, not sent to terminal
				if (
					sendingDisabled ||
					isStreaming ||
					messageQueue.length > 0 ||
					mirrorAskRef.current === "command_output"
				) {
					try {
						console.log("queueMessage", text, images)
						vscode.postMessage({ type: "queueMessage", text, images })
						setInputValue("")
						setSelectedImages([])
					} catch (error) {
						console.error(
							`Failed to queue message: ${error instanceof Error ? error.message : String(error)}`,
						)
					}

					return
				}

				// Mark that user has responded - this prevents any pending auto-approvals.
				userRespondedRef.current = true

				if (messagesRef.current.length === 0) {
					vscode.postMessage({ type: "newTask", text, images })
				} else if (mirrorAskRef.current) {
					if (mirrorAskRef.current === "followup") {
						markFollowUpAsAnswered()
					}

					// Use mirrorAskRef.current
					switch (
						mirrorAskRef.current // Use mirrorAskRef.current
					) {
						case "followup":
						case "tool":
						case "command": // User can provide feedback to a tool or command use.
						case "use_mcp_server":
						case "completion_result": // If this happens then the user has feedback for the completion result.
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
						// There is no other case that a textfield should be enabled.
					}
				} else {
					// This is a new message in an ongoing task.
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
		], // messagesRef and mirrorAskRef are stable
	)

	const handleSetChatBoxMessage = useCallback(
		(text: string, images: string[]) => {
			// Avoid nested template literals by breaking down the logic
			let newValue = text

			if (inputValue !== "") {
				newValue = inputValue + " " + text
			}

			setInputValue(newValue)
			setSelectedImages([...selectedImages, ...images])
		},
		[inputValue, selectedImages],
	)

	// Handle stop button click from textarea
	const handleStopTask = useCallback(() => {
		vscode.postMessage({ type: "cancelTask" })
		setDidClickCancel(true)
	}, [setDidClickCancel])

	// Handle enqueue button click from textarea
	const handleEnqueueCurrentMessage = useCallback(() => {
		const text = inputValue.trim()
		if (text || selectedImages.length > 0) {
			vscode.postMessage({
				type: "queueMessage",
				text,
				images: selectedImages,
			})
			setInputValue("")
			setSelectedImages([])
		}
	}, [inputValue, selectedImages])

	// This logic depends on the useEffect[messages] above to set mirrorAsk,
	// after which buttons are shown and we then send an askResponse to the
	// extension.
	const handlePrimaryButtonClick = useCallback(
		(text?: string, images?: string[]) => {
			// Mark that user has responded
			userRespondedRef.current = true

			const trimmedInput = text?.trim()

			switch (mirrorAsk) {
				case "api_req_failed":
				case "command":
				case "tool":
				case "use_mcp_server":
				case "mistake_limit_reached":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "yesButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
					}
					break
				case "resume_task":
					// For non-completed subtasks, resume the task
					const isCompletedSubtaskForClick =
						currentTaskItem?.parentTaskId &&
						messagesRef.current.some(
							(msg) => msg.ask === "completion_result" || msg.say === "completion_result",
						)
					if (!isCompletedSubtaskForClick) {
						// Only send text/images if they exist
						if (trimmedInput || (images && images.length > 0)) {
							vscode.postMessage({
								type: "askResponse",
								askResponse: "yesButtonClicked",
								text: trimmedInput,
								images: images,
							})
							// Clear input state after sending
							setInputValue("")
							setSelectedImages([])
						} else {
							vscode.postMessage({ type: "askResponse", askResponse: "yesButtonClicked" })
						}
					}
					break
				case "completion_result":
				case "resume_completed_task":
					// Clear state - user can type a message to continue
					break
				case "command_output":
					vscode.postMessage({ type: "terminalOperation", terminalOperation: "continue" })
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
			// Mark that user has responded
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
					// No secondary action for these states
					break
				case "command":
				case "tool":
				case "use_mcp_server":
					// Only send text/images if they exist
					if (trimmedInput || (images && images.length > 0)) {
						vscode.postMessage({
							type: "askResponse",
							askResponse: "noButtonClicked",
							text: trimmedInput,
							images: images,
						})
						// Clear input state after sending
						setInputValue("")
						setSelectedImages([])
					} else {
						// Responds to the API with a "This operation failed" and lets it try again
						vscode.postMessage({ type: "askResponse", askResponse: "noButtonClicked" })
					}
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

	const { id: modelId, info: model } = useSelectedModel(apiConfiguration)

	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	const shouldDisableImages = !model?.supportsImages || selectedImages.length >= MAX_IMAGES_PER_MESSAGE

	const setApiConfigurationField = useCallback(
		<K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => {
			setApiConfiguration({ [field]: value } as Partial<ProviderSettings>)
		},
		[setApiConfiguration],
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

		// Router-based providers (models fetched from the router API)
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
				defaultModelId: poeDefaultModelId,
				serviceName: "Poe",
				serviceUrl: "https://poe.com",
			}
		}

		// vscode-lm: uses its own model record
		if (provider === "vscode-lm") {
			return {
				modelIdKey: "vsCodeLmModelSelector" as const,
				models: vscodeLlmModels as unknown as Record<string, ModelInfo>,
				defaultModelId: vscodeLlmDefaultModelId,
				serviceName: "VS Code LM",
				serviceUrl: "https://code.visualstudio.com/api/extension-guides/language-model",
			}
		}

		// Custom API: uses its own model info
		if (provider === "custom") {
			return {
				modelIdKey: "customModelId" as const,
				models: { [customDefaultModelId]: customDefaultModelInfo },
				defaultModelId: customDefaultModelId,
				serviceName: "Custom API",
				serviceUrl: "",
			}
		}

		// OpenAI Compatible: no model list, use apiModelId
		if (provider === "openai") {
			return {
				modelIdKey: "openAiModelId",
				models: null,
				defaultModelId: "",
				serviceName: "OpenAI Compatible",
				serviceUrl: "",
			}
		}

		// Static model providers (models defined in MODELS_BY_PROVIDER)
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
		// Include custom models saved to localStorage by the old ModelPicker
		let custom: string[] = []
		try {
			const saved = localStorage.getItem(
				`custom_models_${apiConfiguration?.apiProvider}_${modelPickerConfig.modelIdKey}`,
			)
			if (saved) {
				custom = JSON.parse(saved)
			}
		} catch {}
		// Exclude default models the user deleted from the old ModelPicker
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
	}, [modelPickerConfig?.models, modelPickerConfig?.modelIdKey, apiConfiguration?.apiProvider])

	const handleModelChange = useCallback(
		(newModelId: string) => {
			if (modelPickerConfig) {
				setApiConfigurationField(modelPickerConfig.modelIdKey, newModelId)
			}
		},
		[modelPickerConfig, setApiConfigurationField],
	)

	const handleMessage = useCallback(
		(e: MessageEvent) => {
			const message: ExtensionMessage = e.data

			switch (message.type) {
				case "action":
					switch (message.action!) {
						case "didBecomeVisible":
							if (!isHidden && !sendingDisabled && !enableButtons) {
								textAreaRef.current?.focus()
							}
							break
						case "focusInput":
							textAreaRef.current?.focus()
							break
					}
					break
				case "selectedImages":
					// Only handle selectedImages if it's not for editing context
					// When context is "edit", ChatRow will handle the images
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
					// Handle both manual and automatic condensation start
					// We don't check the task ID because:
					// 1. There can only be one active task at a time
					// 2. Task switching resets isCondensing to false (see useEffect with task?.ts dependency)
					// 3. For new tasks, currentTaskItem may not be populated yet due to async state updates
					if (message.text) {
						setIsCondensing(true)
						// Note: sendingDisabled is only set for manual condensation via handleCondenseContext
						// Automatic condensation doesn't disable sending since the task is already running
					}
					break
				case "condenseTaskContextResponse":
					// Same reasoning as above - we trust this is for the current task
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
			// textAreaRef.current is not explicitly required here since React
			// guarantees that ref will be stable across re-renders, and we're
			// not using its value but its reference.
		},
		[
			isCondensing,
			isHidden,
			sendingDisabled,
			enableButtons,
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

	const visibleMessages = useMemo(() => {
		// Pre-compute checkpoint hashes that have associated user messages for O(1) lookup
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

		// Remove the 500-message limit to prevent array index shifting
		// Virtuoso is designed to efficiently handle large lists through virtualization
		const newVisibleMessages = modifiedMessages.filter((message) => {
			// Filter out checkpoint_saved messages that should be suppressed
			if (message.say === "checkpoint_saved") {
				// Check if this checkpoint has the suppressMessage flag set
				if (
					message.checkpoint &&
					typeof message.checkpoint === "object" &&
					"suppressMessage" in message.checkpoint &&
					message.checkpoint.suppressMessage
				) {
					return false
				}
				// Also filter out checkpoint messages associated with user messages (legacy behavior)
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

	useEffect(() => {
		// This ensures the first message is not read, future user messages are
		// labeled as `user_feedback`.
		if (lastMessage && messages.length > 1) {
			if (
				typeof lastMessage.text === "string" && // has text (must be string for startsWith)
				(lastMessage.say === "text" || lastMessage.say === "completion_result") && // is a text message
				!lastMessage.partial && // not a partial message
				!lastMessage.text.startsWith("{") // not a json object
			) {
				let text = lastMessage?.text || ""
				const mermaidRegex = /```mermaid[\s\S]*?```/g
				// remove mermaid diagrams from text
				text = text.replace(mermaidRegex, "")
				// remove markdown from text
				text = removeMd(text)

				// ensure message is not a duplicate of last read message
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

		// Update previous value.
		setWasStreaming(isStreaming)
	}, [isStreaming, lastMessage, wasStreaming, messages.length])

	const latestUserMessage = useMemo(() => {
		// Find the most recent user_feedback message (not the initial task)
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

		// Helper to check if a message is a read_file ask that should be batched
		const isReadFileAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return tool.tool === "readFile" && !tool.batchFiles // Don't re-batch already batched
			} catch {
				return false
			}
		}

		// Helper to check if a message is a list_files ask that should be batched
		const isListFilesAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return (
					(tool.tool === "listFilesTopLevel" || tool.tool === "listFilesRecursive") && !tool.batchDirs // Don't re-batch already batched
				)
			} catch {
				return false
			}
		}

		// Set of tool names that represent file-editing operations
		const editFileTools = new Set([
			"editedExistingFile",
			"appliedDiff",
			"newFileCreated",
			"insertContent",
			"searchAndReplace",
		])

		// Helper to check if a message is a file-edit ask that should be batched
		const isEditFileAsk = (msg: MirrorMessage): boolean => {
			if (msg.type !== "ask" || msg.ask !== "tool") return false
			try {
				const tool = JSON.parse(msg.text || "{}")
				return editFileTools.has(tool.tool) && !tool.batchDiffs // Don't re-batch already batched
			} catch {
				return false
			}
		}

		// Synthesize a batch of consecutive read_file asks into a single message
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

		// Synthesize a batch of consecutive list_files asks into a single message
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

		// Synthesize a batch of consecutive file-edit asks into a single message
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

		// Consolidate consecutive ask messages into batches
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

	// Index of all user_feedback messages in displayedMessages; the latest
	// (last) one is always kept sticky at the top of the viewport.
	const userFeedbackIndices = useMemo(() => {
		const indices: number[] = []
		for (let i = 0; i < displayedMessages.length; i++) {
			if (displayedMessages[i]?.say === "user_feedback") {
				indices.push(i)
			}
		}
		return indices
	}, [displayedMessages])

	// Always pinned to the latest (last) user_feedback message so the most
	// recent user input stays visible at the top regardless of scroll position.
	const [stickyUserIndex, setStickyUserIndex] = useState<number | null>(() => {
		if (userFeedbackIndices.length > 0) {
			return userFeedbackIndices[userFeedbackIndices.length - 1]
		}
		return null
	})

	// Refs so the permanent Virtuoso Item component always reads the latest values.
	const stickyUserIndexRef = useRef(stickyUserIndex)
	stickyUserIndexRef.current = stickyUserIndex
	const displayedMessagesRef = useRef(displayedMessages)
	displayedMessagesRef.current = displayedMessages

	// Pin stickyUserIndex to the latest user_feedback when new messages arrive.
	useEffect(() => {
		if (userFeedbackIndices.length > 0) {
			setStickyUserIndex(userFeedbackIndices[userFeedbackIndices.length - 1])
		} else {
			setStickyUserIndex(null)
		}
	}, [userFeedbackIndices])

	// No-op on scroll — sticky is always pinned to the latest user_feedback.
	const handleRangeChanged = useCallback((_range: { startIndex: number; endIndex: number }) => {
		// Intentionally no-op
	}, [])

	// Stable Virtuoso Item component — reads data via refs so it never needs to
	// be recreated on every render (which would break Virtuoso's internal
	// reconciliation and cause items to lose sticky positioning).
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

	// Scroll lifecycle is managed by a dedicated hook to keep ChatView focused
	// on message handling and UI orchestration.
	const {
		showScrollToBottom,
		handleRowHeightChange,
		handleScrollToBottomClick,
		enterUserBrowsingHistory,
		followOutputCallback,
		atBottomStateChangeCallback,
		scrollToBottomAuto,
		isAtBottomRef,
		scrollPhaseRef,
	} = useScrollLifecycle({
		virtuosoRef,
		scrollContainerRef,
		taskTs: task?.ts,
		isStreaming,
		isHidden,
		hasTask: !!task,
	})

	// Expanding a row indicates the user is browsing; disable sticky follow.
	// Placed after the hook call so enterUserBrowsingHistory is defined.
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
			enterUserBrowsingHistory("row-expansion")
		}

		prevExpandedRowsRef.current = expandedRows
	}, [enterUserBrowsingHistory, expandedRows])

	const handleSetExpandedRow = useCallback(
		(ts: number, expand?: boolean) => {
			setExpandedRows((prev: Record<number, boolean>) => ({
				...prev,
				[ts]: expand === undefined ? !prev[ts] : expand,
			}))
		},
		[setExpandedRows], // setExpandedRows is stable
	)

	// Scroll when user toggles certain rows.
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			handleSetExpandedRow(ts)
			// The logic to set disableAutoScrollRef.current = true on expansion
			// is now handled by the useEffect hook that observes expandedRows.
		},
		[handleSetExpandedRow],
	)

	// Effect to clear checkpoint warning when messages appear or task changes
	useEffect(() => {
		if (isHidden || !task) {
			setCheckpointWarning(undefined)
		}
	}, [modifiedMessages.length, isStreaming, isHidden, task])

	const placeholderText = task ? t("chat:typeMessage") : t("chat:typeTask")

	const switchToMode = useCallback(
		(modeSlug: string): void => {
			// Update local state and notify extension to sync mode change.
			setMode(modeSlug)

			// Send the mode switch message.
			vscode.postMessage({ type: "mode", text: modeSlug })
		},
		[setMode],
	)

	const handleSuggestionClickInRow = useCallback(
		(suggestion: SuggestionItem, event?: React.MouseEvent) => {
			// Mark that user has responded if this is a manual click (not auto-approval)
			if (event) {
				userRespondedRef.current = true
			}

			// Mark the current follow-up question as answered when a suggestion is clicked
			if (mirrorAsk === "followup" && !event?.shiftKey) {
				markFollowUpAsAnswered()
			}

			// Check if we need to switch modes
			if (suggestion.mode) {
				// Only switch modes if it's a manual click (event exists) or auto-approval is allowed
				const isManualClick = !!event
				if (isManualClick || alwaysAllowModeSwitch) {
					// Switch mode without waiting
					switchToMode(suggestion.mode)
				}
			}

			if (event?.shiftKey) {
				// Always append to existing text, don't overwrite
				setInputValue((currentValue: string) => {
					return currentValue !== "" ? `${currentValue} \n${suggestion.answer}` : suggestion.answer
				})
			} else {
				// Don't clear the input value when sending a follow-up choice
				// The message should be sent but the text area should preserve what the user typed
				const preservedInput = inputValueRef.current
				handleSendMessage(suggestion.answer, [])
				// Restore the input value after sending
				setInputValue(preservedInput)
			}
		},
		[handleSendMessage, setInputValue, switchToMode, alwaysAllowModeSwitch, mirrorAsk, markFollowUpAsAnswered],
	)

	const handleBatchFileResponse = useCallback((response: { [key: string]: boolean }) => {
		// Handle batch file response, e.g., for file uploads
		vscode.postMessage({ type: "askResponse", askResponse: "objectResponse", text: JSON.stringify(response) })
	}, [])

	// Cancel backend auto-approval timeout when FollowUpSuggest's countdown effect cleans up.
	// This is called when auto-approve is toggled off, a suggestion is clicked, or the component unmounts.
	const handleFollowUpUnmount = useCallback(() => {
		vscode.postMessage({ type: "cancelAutoApproval" })
	}, [])

	const handleScrollToBottomAndResetCheckpointCursor = useCallback(() => {
		checkpointJumpCursorRef.current = null
		handleScrollToBottomClick()
	}, [handleScrollToBottomClick])

	const handleScrollToLatestCheckpoint = useCallback(() => {
		if (checkpointIndices.length === 0) {
			return
		}

		const previousCursor = checkpointJumpCursorRef.current
		const nextCursor = previousCursor === null ? checkpointIndices.length - 1 : Math.max(0, previousCursor - 1)
		const nextCheckpointIndex = checkpointIndices[nextCursor]
		checkpointJumpCursorRef.current = nextCursor

		enterUserBrowsingHistory("keyboard-nav-up")
		virtuosoRef.current?.scrollToIndex({
			index: nextCheckpointIndex,
			align: "center",
			behavior: "smooth",
		})
	}, [checkpointIndices, enterUserBrowsingHistory])

	const handleNavigateToMessage = useCallback(
		(ts: number) => {
			const messageIndex = displayedMessages.findIndex((msg) => msg.ts === ts)
			if (messageIndex >= 0) {
				enterUserBrowsingHistory("keyboard-nav-up")
				virtuosoRef.current?.scrollToIndex({
					index: messageIndex,
					align: "center",
					behavior: "smooth",
				})
			}
		},
		[displayedMessages, enterUserBrowsingHistory],
	)

	const itemContent = useCallback(
		(index: number, messageOrGroup: MirrorMessage) => {
			if (index === 0 && task) {
				return (
					<TaskHeader
						task={task}
						parentTaskId={currentTaskItem?.parentTaskId}
						buttonsDisabled={sendingDisabled}
					/>
				)
			}

			const hasCheckpoint = modifiedMessages.some((message) => message.say === "checkpoint_saved")
			// Sync with Virtuoso Item component: the message that has CSS sticky
			// positioning should also get the visual sticky treatment.
			const isSticky = stickyUserIndex !== null && index === stickyUserIndex

			// regular message
			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={toggleRowExpansion} // This was already stabilized
					lastModifiedMessage={modifiedMessages.at(-1)} // Original direct access
					isLast={index === displayedMessages.length - 1} // Original direct access
					onHeightChange={handleRowHeightChange}
					isStreaming={isStreaming}
					onSuggestionClick={handleSuggestionClickInRow} // This was already stabilized
					onBatchFileResponse={handleBatchFileResponse}
					onFollowUpUnmount={handleFollowUpUnmount}
					isFollowUpAnswered={messageOrGroup.isAnswered === true || messageOrGroup.ts === currentFollowUpTs}
					isFollowUpAutoApprovalPaused={isFollowUpAutoApprovalPaused}
					editable={
						messageOrGroup.type === "ask" &&
						messageOrGroup.ask === "tool" &&
						(() => {
							let tool: any = {}
							try {
								tool = JSON.parse(messageOrGroup.text || "{}")
							} catch (_) {
								if (messageOrGroup.text?.includes("updateTodoList")) {
									tool = { tool: "updateTodoList" }
								}
							}
							return tool.tool === "updateTodoList" && enableButtons && !!primaryButtonText
						})()
					}
					hasCheckpoint={hasCheckpoint}
					onJumpToPreviousCheckpoint={handleScrollToLatestCheckpoint}
					isSticky={isSticky}
					onNavigateToMessage={handleNavigateToMessage}
				/>
			)
		},
		[
			expandedRows,
			toggleRowExpansion,
			modifiedMessages,
			displayedMessages.length,
			handleRowHeightChange,
			isStreaming,
			handleSuggestionClickInRow,
			handleBatchFileResponse,
			handleFollowUpUnmount,
			currentFollowUpTs,
			isFollowUpAutoApprovalPaused,
			enableButtons,
			primaryButtonText,
			handleScrollToLatestCheckpoint,
			stickyUserIndex,
			handleNavigateToMessage,
		],
	)

	// Function to handle mode switching
	const switchToNextMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const nextModeIndex = (currentModeIndex + 1) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[nextModeIndex].slug)
	}, [mode, customModes, switchToMode])

	// Function to handle switching to previous mode
	const switchToPreviousMode = useCallback(() => {
		const allModes = getAllModes(customModes)
		const currentModeIndex = allModes.findIndex((m) => m.slug === mode)
		const previousModeIndex = (currentModeIndex - 1 + allModes.length) % allModes.length
		// Update local state and notify extension to sync mode change
		switchToMode(allModes[previousModeIndex].slug)
	}, [mode, customModes, switchToMode])

	// Mode switching keyboard handler. Scroll-intent keyboard detection
	// (PageUp, Home, ArrowUp) is handled by useScrollLifecycle.
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

	useImperativeHandle(ref, () => ({
		acceptInput: () => {
			const hasInput = inputValue.trim() || selectedImages.length > 0

			// Special case: during command_output, queue the message instead of
			// triggering the primary button action (which would lose the message)
			if (mirrorAskRef.current === "command_output" && hasInput) {
				vscode.postMessage({ type: "queueMessage", text: inputValue.trim(), images: selectedImages })
				setInputValue("")
				setSelectedImages([])
				return
			}

			if (enableButtons && primaryButtonText) {
				handlePrimaryButtonClick(inputValue, selectedImages)
			} else if (!sendingDisabled && !isProfileDisabled && hasInput) {
				handleSendMessage(inputValue, selectedImages)
			}
		},
	}))

	const handleCondenseContext = (taskId: string) => {
		if (isCondensing || sendingDisabled) {
			return
		}
		setIsCondensing(true)
		setSendingDisabled(true)
		vscode.postMessage({ type: "condenseTaskContextRequest", text: taskId })
	}

	const areButtonsVisible = showScrollToBottom || primaryButtonText || secondaryButtonText

	return (
		<div
			data-testid="chat-view"
			className={isHidden ? "hidden" : "fixed top-0 left-0 right-0 bottom-0 flex flex-col overflow-hidden"}>
			{(showAnnouncement || showAnnouncementModal) && (
				<Announcement
					hideAnnouncement={() => {
						if (showAnnouncementModal) {
							setShowAnnouncementModal(false)
						}
						if (showAnnouncement) {
							hideAnnouncement()
						}
					}}
				/>
			)}
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
																modelId,
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

			{task ? (
				<>
					{checkpointWarning && (
						<div className="px-3 shrink-0 mb-2">
							<CheckpointWarning warning={checkpointWarning} />
						</div>
					)}
				</>
			) : (
				<div className="flex flex-col h-full min-h-0 relative">
					{/* Main Welcome Content Area */}
					<div className="flex-1 overflow-y-auto p-5 flex flex-col justify-start gap-4">
						<div className="flex flex-col gap-4 w-full pt-2">
							{taskHistory.length < 6 && <MirrorTips />}
						</div>
					</div>
				</div>
			)}

			{!task && showWorktreesInHomeScreen && <WorktreeSelector />}

			{task && (
				<>
					<div className="scrollable grow flex flex-col overflow-y-auto" ref={scrollContainerRef}>
						<Virtuoso
							ref={virtuosoRef}
							key={task.ts}
							className="grow mb-1"
							customScrollParent={scrollContainerRef.current || undefined}
							increaseViewportBy={{ top: 3_000, bottom: 1000 }}
							data={displayedMessages}
							itemContent={itemContent}
							followOutput={followOutputCallback}
							atBottomStateChange={atBottomStateChangeCallback}
							atBottomThreshold={10}
							startReached={() => setMessageLimit((prev) => prev + 100)}
							rangeChanged={handleRangeChanged}
							components={virtuosoComponents}
						/>
					</div>
					<FileChangesPanel mirrorMessages={messages} />
					{areButtonsVisible && (
						<div
							className={`flex h-8 items-center mb-1.5 px-4 justify-end gap-2 ${
								showScrollToBottom ? "opacity-100" : enableButtons ? "opacity-100" : "opacity-50"
							}`}>
							{showScrollToBottom ? (
								<>
									<StandardTooltip content={t("chat:scrollToBottom")}>
										<Button
											variant="secondary"
											className="h-7 px-2.5 rounded-md flex items-center justify-center gap-1 text-[11px]"
											onClick={handleScrollToBottomAndResetCheckpointCursor}>
											<span className="codicon codicon-chevron-down text-xs"></span>
											<span>To Bottom</span>
										</Button>
									</StandardTooltip>
									{hasLatestCheckpoint && (
										<StandardTooltip content={t("chat:scrollToLatestCheckpoint")}>
											<Button
												variant="secondary"
												className="h-7 px-2.5 rounded-md flex items-center justify-center gap-1 text-[11px]"
												onClick={handleScrollToLatestCheckpoint}
												aria-label={t("chat:scrollToLatestCheckpoint")}>
												<span className="codicon codicon-history text-xs"></span>
												<span>Checkpoint</span>
											</Button>
										</StandardTooltip>
									)}
								</>
							) : (
								<>
									{secondaryButtonText && (
										<StandardTooltip
											content={
												secondaryButtonText === t("chat:reject.title")
													? t("chat:reject.tooltip")
													: secondaryButtonText === t("chat:terminate.title")
														? t("chat:terminate.tooltip")
														: secondaryButtonText === t("chat:killCommand.title")
															? t("chat:killCommand.tooltip")
															: undefined
											}>
											<Button
												variant="secondary"
												disabled={!enableButtons}
												className="h-7 px-3 rounded-md flex items-center justify-center text-[11px] font-medium"
												onClick={() => handleSecondaryButtonClick(inputValue, selectedImages)}>
												{secondaryButtonText}
											</Button>
										</StandardTooltip>
									)}
									{primaryButtonText && (
										<StandardTooltip
											content={
												primaryButtonText === t("chat:retry.title")
													? t("chat:retry.tooltip")
													: primaryButtonText === t("chat:save.title")
														? t("chat:save.tooltip")
														: primaryButtonText === t("chat:approve.title")
															? t("chat:approve.tooltip")
															: primaryButtonText === t("chat:runCommand.title")
																? t("chat:runCommand.tooltip")
																: primaryButtonText === t("chat:resumeTask.title")
																	? t("chat:resumeTask.tooltip")
																	: primaryButtonText ===
																		  t("chat:proceedAnyways.title")
																		? t("chat:proceedAnyways.tooltip")
																		: primaryButtonText ===
																			  t("chat:proceedWhileRunning.title")
																			? t("chat:proceedWhileRunning.tooltip")
																			: undefined
											}>
											<Button
												variant="primary"
												disabled={!enableButtons}
												className="h-7 px-3.5 rounded-md flex items-center justify-center text-[11px] font-semibold"
												onClick={() => handlePrimaryButtonClick(inputValue, selectedImages)}>
												{primaryButtonText}
											</Button>
										</StandardTooltip>
									)}
								</>
							)}
						</div>
					)}
				</>
			)}

			<QueuedMessages
				queue={messageQueue}
				onRemove={(index) => {
					if (messageQueue[index]) {
						vscode.postMessage({ type: "removeQueuedMessage", text: messageQueue[index].id })
					}
				}}
				onUpdate={(index, newText) => {
					if (messageQueue[index]) {
						vscode.postMessage({
							type: "editQueuedMessage",
							payload: { id: messageQueue[index].id, text: newText, images: messageQueue[index].images },
						})
					}
				}}
			/>
			{showRetiredProviderWarning && (
				<div className="px-[15px] py-1">
					<WarningRow
						title={t("chat:retiredProvider.title")}
						message={t(
							apiConfiguration?.apiProvider === "mirror"
								? "chat:retiredProvider.mirrorMessage"
								: "chat:retiredProvider.message",
						)}
						actionText={t("chat:retiredProvider.openSettings")}
						onAction={() => vscode.postMessage({ type: "switchTab", tab: "settings" })}
					/>
				</div>
			)}
			<ChatTextArea
				ref={textAreaRef}
				inputValue={inputValue}
				setInputValue={setInputValue}
				sendingDisabled={sendingDisabled || isProfileDisabled}
				selectApiConfigDisabled={sendingDisabled && mirrorAsk !== "api_req_failed"}
				placeholderText={placeholderText}
				selectedImages={selectedImages}
				setSelectedImages={setSelectedImages}
				onSend={() => handleSendMessage(inputValue, selectedImages)}
				onSelectImages={selectImages}
				shouldDisableImages={shouldDisableImages}
				onHeightChange={() => {
					if (isAtBottomRef.current && scrollPhaseRef.current !== "USER_BROWSING_HISTORY") {
						scrollToBottomAuto()
					}
				}}
				mode={mode}
				setMode={setMode}
				modeShortcutText={modeShortcutText}
				isStreaming={isStreaming}
				onStop={handleStopTask}
				onEnqueueMessage={handleEnqueueCurrentMessage}
				modelId={modelPickerConfig ? modelId : undefined}
				modelOptions={modelOptions}
				onModelChange={handleModelChange}
			/>

			{isProfileDisabled && (
				<div className="px-3">
					<ProfileViolationWarning />
				</div>
			)}

			<div id="mirror-portal" />
		</div>
	)
}

const ChatView = forwardRef(ChatViewComponent)

export default ChatView
