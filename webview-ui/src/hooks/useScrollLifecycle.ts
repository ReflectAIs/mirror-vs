/**
 * useScrollLifecycle
 *
 * Simplified chat scroll lifecycle with a short, time-boxed hydration window.
 *
 * - Task switch enters `HYDRATING_PINNED_TO_BOTTOM`
 * - We issue one immediate `scrollToIndex("LAST")` and one post-render retry
 * - During hydration, transient Virtuoso `atBottomStateChange(false)` signals
 *   are ignored so follow mode does not flicker off
 * - User escape intent (wheel / keyboard / pointer-upward drag / row expansion)
 *   moves to `USER_BROWSING_HISTORY` and prevents forced re-pinning
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useEvent } from "react-use"
import debounce from "debounce"
import type { VirtuosoHandle } from "react-virtuoso"

const HYDRATION_WINDOW_MS = 600
const HYDRATION_RETRY_WINDOW_MS = 160

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ScrollPhase = "HYDRATING_PINNED_TO_BOTTOM" | "ANCHORED_FOLLOWING" | "USER_BROWSING_HISTORY"

export type ScrollFollowDisengageSource = "wheel-up" | "row-expansion" | "keyboard-nav-up" | "pointer-scroll-up"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isEditableKeyboardTarget = (target: EventTarget | null): boolean => {
	if (!(target instanceof HTMLElement)) {
		return false
	}
	if (target.isContentEditable) {
		return true
	}
	const tagName = target.tagName
	return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT"
}

// ---------------------------------------------------------------------------
// Hook interface
// ---------------------------------------------------------------------------

export interface UseScrollLifecycleOptions {
	virtuosoRef: React.RefObject<VirtuosoHandle | null>
	scrollContainerRef: React.RefObject<HTMLDivElement | null>
	taskId: string | undefined
	isStreaming: boolean
	isHidden: boolean
	hasTask: boolean
}

export interface UseScrollLifecycleReturn {
	scrollPhase: ScrollPhase
	showScrollToBottom: boolean
	handleRowHeightChange: (isTaller: boolean) => void
	handleScrollToBottomClick: () => void
	enterUserBrowsingHistory: (source: ScrollFollowDisengageSource) => void
	followOutputCallback: () => "auto" | false
	atBottomStateChangeCallback: (isAtBottom: boolean) => void
	scrollToBottomAuto: () => void
	isAtBottomRef: React.MutableRefObject<boolean>
	scrollPhaseRef: React.MutableRefObject<ScrollPhase>
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useScrollLifecycle({
	virtuosoRef,
	scrollContainerRef,
	taskId,
	isStreaming,
	isHidden,
	hasTask,
}: UseScrollLifecycleOptions): UseScrollLifecycleReturn {
	// --- Mounted guard ---
	const isMountedRef = useRef(true)

	// --- Phase state ---
	const [scrollPhase, setScrollPhase] = useState<ScrollPhase>("USER_BROWSING_HISTORY")
	const scrollPhaseRef = useRef<ScrollPhase>("USER_BROWSING_HISTORY")

	// --- Visibility state ---
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)

	// --- Bottom detection ---
	const isAtBottomRef = useRef(false)

	// --- Hydration window ---
	const isHydratingRef = useRef(false)
	const hydrationTimeoutRef = useRef<number | null>(null)
	const hydrationRetryUsedRef = useRef(false)

	// --- Pointer scroll tracking ---
	const pointerScrollActiveRef = useRef(false)
	const pointerScrollElementRef = useRef<HTMLElement | null>(null)
	const pointerScrollLastTopRef = useRef<number | null>(null)

	// --- Re-anchor frame ---
	const reanchorAnimationFrameRef = useRef<number | null>(null)
	const isClickingScrollToBottomRef = useRef(false)

	// --- Scroll anchoring (content-shift compensation) ---
	// During streaming, content below the viewport can grow (text fills in),
	// pushing existing items upward. The RAF polling loop below compensates
	// by tracking ALL rendered [data-index] elements' visual positions each
	// frame in a Map<string, number> (index → getBoundingClientRect().top).
	//
	// Key insight: Virtuoso recycles DOM nodes aggressively — the *first*
	// visible [data-index] changes on almost every frame as items scroll in
	// and out. A single-element anchor is too unstable. By tracking ALL
	// visible items, we can find ONE element that persists across two frames
	// and use its delta for compensation.
	//
	// Compensation: if the same logical item shifted position (delta != 0),
	// apply inverse compensation: scrollTop += delta. This undoes the visual
	// shift at the sub-pixel level, every frame. To prevent oscillation, we
	// re-query the DOM immediately after applying compensation so the next
	// frame sees the post-compensation positions.
	const prevVisualAnchorRef = useRef<Map<string, number> | null>(null)
	const driftAccumulatorRef = useRef<number>(0)
	const lastUserScrollInputRef = useRef<number>(0)

	// -----------------------------------------------------------------------
	// Phase transitions
	// -----------------------------------------------------------------------

	const transitionScrollPhase = useCallback((nextPhase: ScrollPhase) => {
		if (scrollPhaseRef.current === nextPhase) {
			return
		}
		scrollPhaseRef.current = nextPhase
		setScrollPhase(nextPhase)
	}, [])

	const enterAnchoredFollowing = useCallback(() => {
		transitionScrollPhase("ANCHORED_FOLLOWING")
		setShowScrollToBottom(false)
	}, [transitionScrollPhase])

	const enterUserBrowsingHistory = useCallback(
		(_source: ScrollFollowDisengageSource) => {
			transitionScrollPhase("USER_BROWSING_HISTORY")
			// Always show the scroll-to-bottom CTA when the user explicitly
			// disengages. If they happen to still be at the physical bottom,
			// the next Virtuoso atBottomStateChange(true) will hide it.
			setShowScrollToBottom(true)
		},
		[transitionScrollPhase],
	)

	const cancelReanchorFrame = useCallback(() => {
		if (reanchorAnimationFrameRef.current !== null) {
			cancelAnimationFrame(reanchorAnimationFrameRef.current)
			reanchorAnimationFrameRef.current = null
		}
	}, [])

	// -----------------------------------------------------------------------
	// Scroll commands
	// -----------------------------------------------------------------------

	const scrollToBottomSmooth = useMemo(
		() =>
			debounce(
				() => virtuosoRef.current?.scrollToIndex({ index: "LAST", align: "end", behavior: "smooth" }),
				10,
				{ immediate: true },
			),
		[virtuosoRef],
	)

	const scrollToBottomAuto = useCallback(() => {
		virtuosoRef.current?.scrollToIndex({
			index: "LAST",
			align: "end",
			behavior: "auto",
		})
	}, [virtuosoRef])

	const clearHydrationWindow = useCallback(() => {
		isHydratingRef.current = false
		hydrationRetryUsedRef.current = false
		if (hydrationTimeoutRef.current !== null) {
			window.clearTimeout(hydrationTimeoutRef.current)
			hydrationTimeoutRef.current = null
		}
	}, [])

	const finishHydrationWindow = useCallback(() => {
		if (!isMountedRef.current || !isHydratingRef.current) {
			return
		}

		if (scrollPhaseRef.current === "HYDRATING_PINNED_TO_BOTTOM") {
			if (isAtBottomRef.current) {
				enterAnchoredFollowing()
			} else {
				if (!hydrationRetryUsedRef.current) {
					hydrationRetryUsedRef.current = true
					scrollToBottomAuto()
					hydrationTimeoutRef.current = window.setTimeout(() => {
						finishHydrationWindow()
					}, HYDRATION_RETRY_WINDOW_MS)
					return
				}

				// Retry budget exhausted. Keep anchored follow rather than
				// downgrading to browsing mode due to non-user transient drift.
				enterAnchoredFollowing()
			}
		}

		clearHydrationWindow()
	}, [clearHydrationWindow, enterAnchoredFollowing, scrollToBottomAuto])

	const startHydrationWindow = useCallback(() => {
		isHydratingRef.current = true
		hydrationRetryUsedRef.current = false
		if (hydrationTimeoutRef.current !== null) {
			window.clearTimeout(hydrationTimeoutRef.current)
		}
		hydrationTimeoutRef.current = window.setTimeout(() => {
			finishHydrationWindow()
		}, HYDRATION_WINDOW_MS)

		scrollToBottomAuto()
	}, [finishHydrationWindow, scrollToBottomAuto])

	// -----------------------------------------------------------------------
	// Lifecycle effects
	// -----------------------------------------------------------------------

	// Mounted guard + global cleanup
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
			clearHydrationWindow()
			cancelReanchorFrame()
			scrollToBottomSmooth.clear()
		}
	}, [cancelReanchorFrame, clearHydrationWindow, scrollToBottomSmooth])

	// Keep phase ref in sync with state
	useEffect(() => {
		scrollPhaseRef.current = scrollPhase
	}, [scrollPhase])

	// Task switch: reset and begin a short hydration window
	useEffect(() => {
		isAtBottomRef.current = false
		clearHydrationWindow()
		cancelReanchorFrame()

		if (taskId) {
			transitionScrollPhase("HYDRATING_PINNED_TO_BOTTOM")
			setShowScrollToBottom(false)
			startHydrationWindow()
		} else {
			transitionScrollPhase("USER_BROWSING_HISTORY")
			setShowScrollToBottom(false)
		}

		return () => {
			clearHydrationWindow()
			cancelReanchorFrame()
		}
	}, [cancelReanchorFrame, clearHydrationWindow, startHydrationWindow, taskId, transitionScrollPhase])

	// -----------------------------------------------------------------------
	// Row height change handler
	// -----------------------------------------------------------------------

	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (
				scrollPhaseRef.current === "USER_BROWSING_HISTORY" ||
				scrollPhaseRef.current === "HYDRATING_PINNED_TO_BOTTOM"
			) {
				return
			}

			const shouldForcePin = scrollPhaseRef.current === "ANCHORED_FOLLOWING"
			if (isAtBottomRef.current || shouldForcePin) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					scrollToBottomAuto()
				}
			}
		},
		[scrollToBottomSmooth, scrollToBottomAuto],
	)

	// -----------------------------------------------------------------------
	// Scroll-to-bottom click handler
	// -----------------------------------------------------------------------

	const handleScrollToBottomClick = useCallback(() => {
		isClickingScrollToBottomRef.current = true
		enterAnchoredFollowing()
		scrollToBottomAuto()
		cancelReanchorFrame()
		reanchorAnimationFrameRef.current = requestAnimationFrame(() => {
			reanchorAnimationFrameRef.current = null
			if (scrollPhaseRef.current === "ANCHORED_FOLLOWING") {
				scrollToBottomAuto()
			}
			setTimeout(() => {
				isClickingScrollToBottomRef.current = false
			}, 50)
		})
	}, [cancelReanchorFrame, enterAnchoredFollowing, scrollToBottomAuto])

	// Auto-anchor and follow when streaming is active on the current tab
	useEffect(() => {
		if (isStreaming && !isHidden) {
			enterAnchoredFollowing()
			scrollToBottomAuto()
		}
	}, [isStreaming, isHidden, enterAnchoredFollowing, scrollToBottomAuto])

	// -----------------------------------------------------------------------
	// Virtuoso callback: followOutput
	// -----------------------------------------------------------------------

	const followOutputCallback = useCallback((): "auto" | false => {
		return scrollPhase === "USER_BROWSING_HISTORY" && !isStreaming ? false : "auto"
	}, [scrollPhase, isStreaming])

	// -----------------------------------------------------------------------
	// Virtuoso callback: atBottomStateChange
	// -----------------------------------------------------------------------

	const atBottomStateChangeCallback = useCallback(
		(isAtBottom: boolean) => {
			isAtBottomRef.current = isAtBottom

			const currentPhase = scrollPhaseRef.current

			if (!isAtBottom && isHydratingRef.current && currentPhase !== "USER_BROWSING_HISTORY") {
				setShowScrollToBottom(false)
				return
			}

			if (isAtBottom) {
				if (currentPhase === "USER_BROWSING_HISTORY" && isHydratingRef.current) {
					setShowScrollToBottom(true)
					return
				}

				enterAnchoredFollowing()
				return
			}

			if (currentPhase === "ANCHORED_FOLLOWING" && !isAtBottom) {
				if (isClickingScrollToBottomRef.current) {
					return
				}

				const timeSinceUserInput = performance.now() - lastUserScrollInputRef.current
				const userRecentlyScrolled = timeSinceUserInput < 250 || pointerScrollActiveRef.current

				if (userRecentlyScrolled) {
					// User explicitly initiated scroll input (wheel up, drag, key navigation)
					enterUserBrowsingHistory("pointer-scroll-up")
					return
				}

				// Content grew at the bottom during streaming (NO user scroll input).
				// Auto-scroll to keep pinned at bottom.
				scrollToBottomAuto()
				setShowScrollToBottom(false)
				return
			}

			setShowScrollToBottom(currentPhase === "USER_BROWSING_HISTORY")
		},
		[enterAnchoredFollowing, enterUserBrowsingHistory, scrollToBottomAuto],
	)

	// -----------------------------------------------------------------------
	// Scroll anchoring (Multi-Anchor Visual Tracking)
	//
	// During streaming, content below the viewport grows, pushing existing
	// items upward. We compensate by tracking ALL rendered [data-index]
	// elements' visual positions (getBoundingClientRect().top) each frame.
	//
	// Why multi-anchor: Virtuoso recycles DOM nodes aggressively — the
	// FIRST visible [data-index] changes on almost every frame. By tracking
	// ALL items in a Map<string, number>, we can find ANY element that
	// persists across two frames and use its delta for compensation.
	//
	// Compensation: if the same logical item shifted (delta != 0), apply
	// inverse compensation: scrollTop += delta. This undoes the visual shift
	// at the sub-pixel level, every frame.
	//
	// Anti-oscillation: after applying compensation, we immediately re-query
	// the DOM and store post-compensation positions as the new prev map.
	// This prevents the next frame from seeing a stale pre-compensation delta.
	// -----------------------------------------------------------------------

	useEffect(() => {
		let rafId: number | null = null
		let lastPollTime = 0

		const pollAnchor = (now: number) => {
			const phase = scrollPhaseRef.current
			const scroller = scrollContainerRef.current

			if (phase === "USER_BROWSING_HISTORY" && scroller) {
				// Throttle layout queries to at most once every ~32ms (~30fps) to eliminate layout thrashing
				if (now - lastPollTime >= 32) {
					lastPollTime = now
					const msSinceUserInput = performance.now() - lastUserScrollInputRef.current
					const activelyScrolling = msSinceUserInput < 150

					// 1. Snapshot raw float positions of all [data-index] elements
					const scrollerTop = scroller.getBoundingClientRect().top
					const currentAnchors = new Map<string, number>()
					const items = scroller.querySelectorAll<HTMLElement>("[data-index]")
					for (let i = 0; i < items.length; i++) {
						const el = items[i]
						const inner = el.querySelector("[data-ts]")
						const key = inner ? inner.getAttribute("data-ts") : el.getAttribute("data-index")
						if (key !== null) {
							currentAnchors.set(key, el.getBoundingClientRect().top - scrollerTop)
						}
					}

					const prevAnchors = prevVisualAnchorRef.current
					let compensated = false

					// 2. Compare against previous frame's positions
					if (!activelyScrolling && prevAnchors && prevAnchors.size > 0 && currentAnchors.size > 0) {
						let matchCount = 0
						let sumDelta = 0

						for (const [idx, prevTop] of prevAnchors) {
							const currentTop = currentAnchors.get(idx)
							if (currentTop !== undefined) {
								matchCount++
								const delta = currentTop - prevTop
								sumDelta += delta
							}
						}

						if (matchCount > 0) {
							// 3. Compute average drift across ALL matching elements.
							const avgDelta = sumDelta / matchCount

							// 4. Accumulate the fractional drift.
							const accumulator = driftAccumulatorRef.current + avgDelta
							driftAccumulatorRef.current = accumulator

							const intDelta = Math.round(accumulator)
							if (intDelta !== 0) {
								// 5. Apply inverse compensation (integer pixel amount)
								scroller.scrollTop += intDelta

								// 6. Remove compensated amount from accumulator
								driftAccumulatorRef.current -= intDelta
								prevVisualAnchorRef.current = null
								compensated = true
							}
						}
					} else if (activelyScrolling) {
						// Reset accumulator when user actively scrolls
						driftAccumulatorRef.current = 0
					}

					if (!compensated) {
						prevVisualAnchorRef.current = currentAnchors
					}
				}
			} else {
				if (prevVisualAnchorRef.current !== null) {
					prevVisualAnchorRef.current = null
				}
				driftAccumulatorRef.current = 0
			}

			rafId = requestAnimationFrame(pollAnchor)
		}

		rafId = requestAnimationFrame(pollAnchor)

		return () => {
			if (rafId !== null) {
				cancelAnimationFrame(rafId)
				rafId = null
			}
		}
	}, [scrollContainerRef])

	// -----------------------------------------------------------------------
	// User intent: wheel
	// -----------------------------------------------------------------------

	const handleWheel = useCallback(
		(event: Event) => {
			const wheelEvent = event as WheelEvent
			if (scrollContainerRef.current?.contains(wheelEvent.target as Node)) {
				// Always timestamp user scroll input (any direction) so the
				// compensation RAF loop knows not to fight user intent.
				lastUserScrollInputRef.current = performance.now()

				// Only disengage anchored follow when scrolling UP.
				if (wheelEvent.deltaY < 0) {
					enterUserBrowsingHistory("wheel-up")
				}
			}
		},
		[enterUserBrowsingHistory, scrollContainerRef],
	)
	useEvent("wheel", handleWheel, window, { passive: true })

	// -----------------------------------------------------------------------
	// User intent: pointer drag
	// -----------------------------------------------------------------------

	const handlePointerDown = useCallback(
		(event: Event) => {
			const pointerEvent = event as PointerEvent
			const pointerTarget = pointerEvent.target
			if (!(pointerTarget instanceof HTMLElement)) {
				pointerScrollActiveRef.current = false
				pointerScrollElementRef.current = null
				pointerScrollLastTopRef.current = null
				return
			}

			if (!scrollContainerRef.current?.contains(pointerTarget)) {
				pointerScrollActiveRef.current = false
				pointerScrollElementRef.current = null
				pointerScrollLastTopRef.current = null
				return
			}

			const scroller =
				(pointerTarget.closest(".scrollable") as HTMLElement | null) ??
				(pointerTarget.scrollHeight > pointerTarget.clientHeight ? pointerTarget : null)

			pointerScrollActiveRef.current = scroller !== null
			pointerScrollElementRef.current = scroller
			pointerScrollLastTopRef.current = scroller?.scrollTop ?? null
		},
		[scrollContainerRef],
	)

	const handlePointerEnd = useCallback(() => {
		pointerScrollActiveRef.current = false
		pointerScrollElementRef.current = null
		pointerScrollLastTopRef.current = null
	}, [])

	const handlePointerActiveScroll = useCallback(
		(event: Event) => {
			if (!pointerScrollActiveRef.current) {
				return
			}

			const scrollTarget = event.target
			if (!(scrollTarget instanceof HTMLElement)) {
				return
			}

			if (!scrollContainerRef.current?.contains(scrollTarget)) {
				return
			}

			if (pointerScrollElementRef.current !== scrollTarget) {
				return
			}

			const previousTop = pointerScrollLastTopRef.current
			const currentTop = scrollTarget.scrollTop
			pointerScrollLastTopRef.current = currentTop

			// Always timestamp ANY scroll motion so the compensation RAF loop
			// knows the user is actively scrolling (any direction).
			if (previousTop !== null && currentTop !== previousTop) {
				lastUserScrollInputRef.current = performance.now()

				if (currentTop < previousTop) {
					enterUserBrowsingHistory("pointer-scroll-up")
				}
			}
		},
		[enterUserBrowsingHistory, scrollContainerRef],
	)

	useEvent("pointerdown", handlePointerDown, window, { passive: true })
	useEvent("pointerup", handlePointerEnd, window, { passive: true })
	useEvent("pointercancel", handlePointerEnd, window, { passive: true })
	useEvent("scroll", handlePointerActiveScroll, window, { passive: true, capture: true })

	// -----------------------------------------------------------------------
	// User intent: keyboard navigation
	// -----------------------------------------------------------------------

	const handleScrollKeyDown = useCallback(
		(event: Event) => {
			const keyEvent = event as KeyboardEvent

			if (!hasTask || isHidden) {
				return
			}

			if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) {
				return
			}

			if (
				keyEvent.key !== "PageUp" &&
				keyEvent.key !== "PageDown" &&
				keyEvent.key !== "Home" &&
				keyEvent.key !== "ArrowUp" &&
				keyEvent.key !== "ArrowDown"
			) {
				return
			}

			if (isEditableKeyboardTarget(keyEvent.target)) {
				return
			}

			const activeElement = document.activeElement
			const focusInsideChat =
				activeElement instanceof HTMLElement && !!scrollContainerRef.current?.contains(activeElement)
			const eventTargetInsideChat =
				keyEvent.target instanceof Node && !!scrollContainerRef.current?.contains(keyEvent.target)

			if (focusInsideChat || eventTargetInsideChat || activeElement === document.body) {
				lastUserScrollInputRef.current = performance.now()
				enterUserBrowsingHistory("keyboard-nav-up")
			}
		},
		[enterUserBrowsingHistory, hasTask, isHidden, scrollContainerRef],
	)
	useEvent("keydown", handleScrollKeyDown, window)

	// -----------------------------------------------------------------------
	// Return public API
	// -----------------------------------------------------------------------

	return {
		scrollPhase,
		showScrollToBottom,
		handleRowHeightChange,
		handleScrollToBottomClick,
		enterUserBrowsingHistory,
		followOutputCallback,
		atBottomStateChangeCallback,
		scrollToBottomAuto,
		isAtBottomRef,
		scrollPhaseRef,
	}
}
