import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { StickyUserMessageHud } from "../StickyUserMessageHud"
import type { MirrorMessage } from "@mirror-vs/types"

describe("StickyUserMessageHud", () => {
	const messages: MirrorMessage[] = [
		{ type: "say", say: "user_feedback", ts: 1000, text: "First prompt about setup" },
		{ type: "say", say: "text", ts: 1001, text: "Assistant response 1" },
		{ type: "say", say: "text", ts: 1002, text: "Assistant response 2" },
		{ type: "say", say: "user_feedback", ts: 2000, text: "Second prompt about bug fix" },
		{ type: "say", say: "text", ts: 2001, text: "Assistant response 3" },
		{ type: "say", say: "user_feedback", ts: 3000, text: "Third prompt about testing" },
		{ type: "say", say: "text", ts: 3001, text: "Assistant response 4" },
	]

	it("renders top sticky prompt when scrolled past the first user message", () => {
		const onJump = vi.fn()
		render(
			<StickyUserMessageHud
				displayedMessages={messages}
				visibleRange={{ startIndex: 2, endIndex: 4 }}
				onJumpToMessage={onJump}
			/>,
		)

		// startIndex is 2, user message 0 is at index 0 (< 2), so it should be sticky on top
		const topHud = screen.getByTestId("sticky-user-top")
		expect(topHud).toBeInTheDocument()
		expect(topHud).toHaveTextContent("First prompt about setup")

		// Click "Go to prompt" button
		const jumpBtn = screen.getByRole("button", { name: /go to prompt/i })
		fireEvent.click(jumpBtn)
		expect(onJump).toHaveBeenCalledWith(0)
	})

	it("renders bottom sticky prompt when earlier messages are in view and next user message is below", () => {
		const onJump = vi.fn()
		render(
			<StickyUserMessageHud
				displayedMessages={messages}
				visibleRange={{ startIndex: 1, endIndex: 2 }}
				onJumpToMessage={onJump}
			/>,
		)

		// Next user message is at index 3 (> endIndex 2), so it should be sticky at the bottom
		const bottomHud = screen.getByTestId("sticky-user-bottom")
		expect(bottomHud).toBeInTheDocument()
		expect(bottomHud).toHaveTextContent("Second prompt about bug fix")

		// Click jump button
		fireEvent.click(bottomHud.querySelector("button")!)
		expect(onJump).toHaveBeenCalledWith(3)
	})

	it("does not render top sticky when visibleRange.startIndex is 0 (first item visible)", () => {
		render(
			<StickyUserMessageHud
				displayedMessages={messages}
				visibleRange={{ startIndex: 0, endIndex: 2 }}
				onJumpToMessage={() => {}}
			/>,
		)

		expect(screen.queryByTestId("sticky-user-top")).not.toBeInTheDocument()
	})

	it("does not render bottom sticky when all messages are above or within view", () => {
		render(
			<StickyUserMessageHud
				displayedMessages={messages}
				visibleRange={{ startIndex: 4, endIndex: 6 }}
				onJumpToMessage={() => {}}
			/>,
		)

		expect(screen.queryByTestId("sticky-user-bottom")).not.toBeInTheDocument()
	})
})
