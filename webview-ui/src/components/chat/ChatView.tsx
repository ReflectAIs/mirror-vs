import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"

import type { MirrorMessage } from "@mirror-vs/types"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import Announcement from "./Announcement"
import ChatRow from "./ChatRow"
import WarningRow from "./WarningRow"
import { ChatTextArea } from "./ChatTextArea"
import TaskHeader from "./TaskHeader"
import ProfileViolationWarning from "./ProfileViolationWarning"
import { CheckpointWarning } from "./CheckpointWarning"
import { QueuedMessages } from "./QueuedMessages"
import { WorktreeSelector } from "./WorktreeSelector"
import FileChangesPanel from "./FileChangesPanel"
import { useScrollLifecycle } from "@src/hooks/useScrollLifecycle"

import { useChatMessages } from "./hooks/useChatMessages"
import ChatToolbar from "./ChatToolbar"
import ChatActionBar from "./ChatActionBar"
import ChatWelcomeContent from "./ChatWelcomeContent"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

export interface ChatViewRef {
	acceptInput: () => void
}

export const MAX_IMAGES_PER_MESSAGE = 20 // This is the Anthropic limit.

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ChatViewComponent: React.ForwardRefRenderFunction<ChatViewRef, ChatViewProps> = (
	{ isHidden, showAnnouncement, hideAnnouncement },
	ref,
) => {
	const { t } = useAppTranslation()

	const {
		mirrorMessages: messages,
		fileEdits,
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

	// ── Use the extracted hook for all message state, effects, and handlers ──
	const msg = useChatMessages({
		messages,
		currentTaskItem,
		currentTaskTodos,
		apiConfiguration,
		organizationAllowList,
		mode,
		setMode,
		setApiConfiguration,
		customModes,
		soundEnabled: soundEnabled ?? false,
		soundVolume: soundVolume ?? 0.5,
		messageQueue,
		isHidden,
		routerModels,
		t,
	})

	const {
		virtuosoRef,
		scrollContainerRef,
		textAreaRef,
		inputValueRef,
		mirrorAskRef,

		inputValue,
		setInputValue,
		selectedImages,
		setSelectedImages,
		modeShortcutText,
		sendingDisabled,
		mirrorAsk,
		enableButtons,
		primaryButtonText,
		secondaryButtonText,
		expandedRows,
		activeHeaderPanel,
		setActiveHeaderPanel,
		checkpointWarning,
		isCondensing,
		isProfileDisabled,
		optimisticQueue,
		effectiveQueue,
		showRetiredProviderWarning,
		setShowRetiredProviderWarning,
		aggregatedCostsMap,
		showAnnouncementModal,
		setShowAnnouncementModal,
		messageLimit,
		setMessageLimit,

		task,
		latestTodos,
		apiMetrics,
		modifiedMessages,
		displayedMessages,
		stickyUserIndex,
		hasLatestCheckpoint,
		currentFollowUpTs,
		isStreaming,
		messageWillQueue,
		modelActivity,
		modelPickerConfig,
		modelOptions,
		modelId,
		model,
		placeholderText,
		shouldDisableImages,

		handleSendMessage,
		handleStopTask,
		handleEnqueueCurrentMessage,
		handlePrimaryButtonClick,
		handleSecondaryButtonClick,
		handleCondenseContext,
		handleChatReset,
		handleModelChange,
		switchToMode,
		handleSuggestionClickInRow,
		handleBatchFileResponse,
		handleFollowUpUnmount,
		handleScrollToBottomAndResetCheckpointCursor: _handleScrollToBottomAndResetCheckpointCursor,
		handleScrollToLatestCheckpoint,
		handleNavigateToMessage,
		handleRangeChanged,
		virtuosoComponents,
	} = msg

	// ── Scroll lifecycle (needs refs from the hook) ──
	const scrollLifecycle = useScrollLifecycle({
		virtuosoRef,
		scrollContainerRef,
		taskTs: task?.ts,
		isStreaming,
		isHidden,
		hasTask: !!task,
	})

	const {
		showScrollToBottom: showScrollToBottom2,
		handleRowHeightChange: handleRowHeightChange2,
		handleScrollToBottomClick: handleScrollToBottomClick2,
		enterUserBrowsingHistory: enterUserBrowsingHistory2,
		followOutputCallback: followOutputCallback2,
		atBottomStateChangeCallback: atBottomStateChangeCallback2,
		scrollToBottomAuto: scrollToBottomAuto2,
		isAtBottomRef: isAtBottomRef2,
		scrollPhaseRef: scrollPhaseRef2,
	} = scrollLifecycle

	// ── Wrap scroll-to-bottom to integrate hook + scroll lifecycle ──
	const handleScrollToBottomAndResetCheckpointCursor = useCallback(() => {
		_handleScrollToBottomAndResetCheckpointCursor()
		handleScrollToBottomClick2()
	}, [_handleScrollToBottomAndResetCheckpointCursor, handleScrollToBottomClick2])

	// ── Row expansion → notify scroll lifecycle ──
	const prevExpandedRef = useRef<Record<number, boolean>>({})
	useEffect(() => {
		const prev = prevExpandedRef.current
		let wasExpanded = false
		for (const [tsKey, isExpanded] of Object.entries(expandedRows)) {
			if (isExpanded && !(prev[Number(tsKey)] ?? false)) {
				wasExpanded = true
				break
			}
		}
		if (wasExpanded) {
			enterUserBrowsingHistory2("row-expansion")
		}
		prevExpandedRef.current = expandedRows
	}, [expandedRows, enterUserBrowsingHistory2])

	// ── itemContent: Virtuoso item renderer (needs child components) ──
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

			return (
				<ChatRow
					key={messageOrGroup.ts}
					message={messageOrGroup}
					isExpanded={expandedRows[messageOrGroup.ts] || false}
					onToggleExpand={msg.toggleRowExpansion}
					lastModifiedMessage={modifiedMessages.at(-1)}
					isLast={index === displayedMessages.length - 1}
					onHeightChange={handleRowHeightChange2}
					isStreaming={isStreaming}
					onSuggestionClick={handleSuggestionClickInRow}
					onBatchFileResponse={handleBatchFileResponse}
					onFollowUpUnmount={handleFollowUpUnmount}
					isFollowUpAnswered={messageOrGroup.isAnswered === true || messageOrGroup.ts === currentFollowUpTs}
					isFollowUpAutoApprovalPaused={msg.isFollowUpAutoApprovalPaused}
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
					isSticky={messageOrGroup.say === "user_feedback" && index === stickyUserIndex}
					onNavigateToMessage={handleNavigateToMessage}
				/>
			)
		},
		[
			task,
			currentTaskItem?.parentTaskId,
			sendingDisabled,
			expandedRows,
			msg.toggleRowExpansion,
			modifiedMessages,
			displayedMessages.length,
			handleRowHeightChange2,
			isStreaming,
			handleSuggestionClickInRow,
			handleBatchFileResponse,
			handleFollowUpUnmount,
			currentFollowUpTs,
			msg.isFollowUpAutoApprovalPaused,
			enableButtons,
			primaryButtonText,
			handleScrollToLatestCheckpoint,
			handleNavigateToMessage,
			stickyUserIndex,
		],
	)

	// ── Imperative handle (acceptInput) ──
	useImperativeHandle(ref, () => ({
		acceptInput: () => {
			const hasInput = inputValue.trim() || selectedImages.length > 0

			// Special case: during command_output, queue the message
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

	// ── Button visibility ──
	const areButtonsVisible = showScrollToBottom2 || primaryButtonText || secondaryButtonText

	// ── Select images handler ──
	const selectImages = useCallback(() => vscode.postMessage({ type: "selectImages" }), [])

	// ── Render ──
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
			<ChatToolbar
				task={task}
				modelActivity={modelActivity}
				currentTaskItem={currentTaskItem}
				apiMetrics={apiMetrics}
				aggregatedCostsMap={aggregatedCostsMap}
				activeHeaderPanel={activeHeaderPanel}
				setActiveHeaderPanel={setActiveHeaderPanel}
				latestTodos={latestTodos}
				sendingDisabled={sendingDisabled}
				modelId={modelId}
				model={model}
				apiConfiguration={apiConfiguration}
				setShowRetiredProviderWarning={setShowRetiredProviderWarning}
				handleCondenseContext={handleCondenseContext}
				t={t}
			/>

			{task ? (
				<>
					{checkpointWarning && (
						<div className="px-3 shrink-0 mb-2">
							<CheckpointWarning warning={checkpointWarning} />
						</div>
					)}
				</>
			) : (
				<ChatWelcomeContent taskHistoryLength={taskHistory.length} />
			)}

			{!task && showWorktreesInHomeScreen && <WorktreeSelector />}

			{task && (
				<>
					<div className="scrollable grow flex flex-col overflow-y-auto" ref={scrollContainerRef as any}>
						<Virtuoso
							ref={virtuosoRef as any}
							key={task.ts}
							className="grow mb-1"
							customScrollParent={scrollContainerRef.current || undefined}
							increaseViewportBy={{ top: 3_000, bottom: 1000 }}
							data={displayedMessages}
							itemContent={itemContent}
							followOutput={followOutputCallback2}
							atBottomStateChange={atBottomStateChangeCallback2}
							atBottomThreshold={10}
							startReached={() => setMessageLimit((prev) => prev + 100)}
							components={virtuosoComponents}
						/>
					</div>
					<FileChangesPanel mirrorMessages={messages} fileEdits={fileEdits} />
					{areButtonsVisible && (
						<ChatActionBar
							showScrollToBottom={showScrollToBottom2}
							primaryButtonText={primaryButtonText}
							secondaryButtonText={secondaryButtonText}
							enableButtons={enableButtons}
							hasLatestCheckpoint={hasLatestCheckpoint}
							inputValue={inputValue}
							selectedImages={selectedImages}
							onScrollToBottom={handleScrollToBottomAndResetCheckpointCursor}
							onScrollToCheckpoint={handleScrollToLatestCheckpoint}
							onPrimaryButtonClick={(text, images) =>
								handlePrimaryButtonClick(text ?? inputValue, images ?? selectedImages)
							}
							onSecondaryButtonClick={(text, images) =>
								handleSecondaryButtonClick(text ?? inputValue, images ?? selectedImages)
							}
							t={t}
						/>
					)}
				</>
			)}

			<QueuedMessages
				queue={effectiveQueue}
				onRemove={(index) => {
					if (effectiveQueue[index]) {
						vscode.postMessage({ type: "removeQueuedMessage", text: effectiveQueue[index].id })
					}
				}}
				onUpdate={(index, newText) => {
					if (effectiveQueue[index]) {
						vscode.postMessage({
							type: "editQueuedMessage",
							payload: {
								id: effectiveQueue[index].id,
								text: newText,
								images: effectiveQueue[index].images,
							},
						})
					}
				}}
				onForceSend={(index) => {
					if (effectiveQueue[index]) {
						const queuedMsg = effectiveQueue[index]
						vscode.postMessage({ type: "removeQueuedMessage", text: queuedMsg.id })
						handleSendMessage(queuedMsg.text, queuedMsg.images || [], true)
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
				ref={textAreaRef as any}
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
					if (isAtBottomRef2.current && scrollPhaseRef2.current !== "USER_BROWSING_HISTORY") {
						scrollToBottomAuto2()
					}
				}}
				mode={mode}
				setMode={setMode}
				modeShortcutText={modeShortcutText}
				isStreaming={isStreaming || mirrorAsk === "command_output"}
				messageWillQueue={messageWillQueue}
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
