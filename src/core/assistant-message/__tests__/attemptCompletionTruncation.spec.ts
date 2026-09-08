import { NativeToolCallParser } from "../NativeToolCallParser"

/**
 * Debug tests for the reported bug:
 * "attempt_completion does not show the full result text — it leaves a little
 * at the end incomplete. Last character visible is `{`."
 *
 * These tests simulate the exact streaming pipeline used by TaskMainLoop:
 *   processRawChunk -> tool_call_start / tool_call_delta / tool_call_end
 *   processStreamingChunk (partial-json) -> finalizeStreamingToolCall (JSON.parse)
 *
 * The suspected failure mode: the provider cuts the stream off mid-JSON
 * (arguments end with an unterminated string / `{`), JSON.parse throws in
 * parseToolCall, finalizeStreamingToolCall returns null, and TaskMainLoop
 * falls back to executing the PARTIAL block whose `result` was truncated
 * by partial-json. The user then sees a completion message that ends
 * abruptly (e.g. "...Restart the backend server{").
 */
describe("NativeToolCallParser - attempt_completion truncation debug", () => {
	beforeEach(() => {
		NativeToolCallParser.clearAllStreamingToolCalls()
		NativeToolCallParser.clearRawChunkState()
	})

	/**
	 * Simulates TaskMainLoop's chunk processing for a streamed tool call.
	 * Feeds the arguments string in small deltas (like real provider chunks)
	 * and returns the last partial ToolUse plus the finalized ToolUse.
	 */
	function simulateStream(id: string, name: string, args: string, chunkSize = 24) {
		// tool_call_start
		NativeToolCallParser.processRawChunk({ index: 0, id, name })
		NativeToolCallParser.startStreamingToolCall(id, name)

		// tool_call_delta(s)
		let lastPartial: ReturnType<typeof NativeToolCallParser.processStreamingChunk> = null
		for (let i = 0; i < args.length; i += chunkSize) {
			const delta = args.slice(i, i + chunkSize)
			NativeToolCallParser.processRawChunk({ index: 0, arguments: delta })
			const partial = NativeToolCallParser.processStreamingChunk(id, delta)
			if (partial) {
				lastPartial = partial
			}
		}

		// tool_call_end
		const final = NativeToolCallParser.finalizeStreamingToolCall(id)
		return { lastPartial, final }
	}

	const fullResult = [
		"Fix backend/.env — added AWS_PROFILE=jai (verified this profile has HeadBucket/upload access).",
		".env-example — documented AWS_PROFILE plus the S3 config vars.",
		"Added verification scripts: test_s3_profile.js and test_s3_upload_e2e.js.",
		"Verification: UPLOAD OK -> CLEANUP OK (test object deleted)",
		"Restart the backend server",
	].join("\n")

	const completeArgs = JSON.stringify({ result: fullResult })

	it("1. happy path: complete stream yields the FULL result text", () => {
		const { lastPartial, final } = simulateStream("toolu_ok_1", "attempt_completion", completeArgs)

		expect(final).not.toBeNull()
		expect(final?.type).toBe("tool_use")
		const nativeArgs = (final as any)?.nativeArgs as { result: string } | undefined
		expect(nativeArgs?.result).toBe(fullResult)
		expect(nativeArgs?.result.endsWith("{")).toBe(false)
		// Partial updates should also never exceed the final text
		if (lastPartial) {
			expect((lastPartial.nativeArgs as any)?.result?.length).toBeLessThanOrEqual(fullResult.length)
		}
	})

	it("2. partial streaming: intermediate partials grow monotonically and never end with a stray `{`", () => {
		const id = "toolu_partial_1"
		NativeToolCallParser.processRawChunk({ index: 0, id, name: "attempt_completion" })
		NativeToolCallParser.startStreamingToolCall(id, "attempt_completion")

		let previousLength = 0
		for (let i = 0; i < completeArgs.length; i += 16) {
			const delta = completeArgs.slice(i, i + 16)
			NativeToolCallParser.processRawChunk({ index: 0, arguments: delta })
			const partial = NativeToolCallParser.processStreamingChunk(id, delta)
			if (partial) {
				const result = (partial.nativeArgs as any)?.result as string | undefined
				if (result !== undefined) {
					// Result must only grow during streaming
					expect(result.length).toBeGreaterThanOrEqual(previousLength)
					previousLength = result.length
					// A partial result should never contain a trailing `{` from the
					// JSON envelope itself (only if the model literally wrote one)
					if (result.length < fullResult.length) {
						expect(result.endsWith("{")).toBe(false)
					}
				}
			}
		}
	})

	it("3. FIX: stream truncated mid-JSON — finalize returns salvaged block flagged truncatedArgs", () => {
		// Simulate a provider that cuts the stream: the JSON envelope is never closed.
		// e.g. '{"result": "Fix ... Restart the backend server{'  <- cut here
		const truncatedArgs = `{"result": ${JSON.stringify(fullResult).slice(0, -40)}` // unterminated string + no closing brace

		const { final } = simulateStream("toolu_trunc_1", "attempt_completion", truncatedArgs)

		// Fixed behavior: finalize salvages the partial-json result and flags it
		// with truncatedArgs so the execution layer refuses to run it silently.
		expect(final).not.toBeNull()
		expect(final?.type).toBe("tool_use")
		expect((final as any).truncatedArgs).toBe(true)
		const nativeArgs = (final as any).nativeArgs as { result: string }
		expect(nativeArgs.result.length).toBeLessThan(fullResult.length)
		// eslint-disable-next-line no-console
		console.log("[debug] salvaged result on truncated stream:", JSON.stringify(nativeArgs.result))
	})

	it("4. FIX: finalize with malformed JSON returns salvaged ToolUse flagged truncatedArgs", () => {
		const id = "toolu_trunc_2"
		NativeToolCallParser.startStreamingToolCall(id, "attempt_completion")

		// Severely malformed: unterminated string, no closing brace
		NativeToolCallParser.processStreamingChunk(id, '{"result": "Restart the backend server')

		const final = NativeToolCallParser.finalizeStreamingToolCall(id)

		// Fixed behavior: instead of returning null (which forced TaskMainLoop to
		// execute the truncated partial block), finalize salvages the partial-json
		// result and flags it with truncatedArgs so presentAssistantMessage can
		// short-circuit execution with an error tool_result.
		expect(final).not.toBeNull()
		expect(final?.type).toBe("tool_use")
		expect((final as any).truncatedArgs).toBe(true)
		expect((final as any).partial).toBe(false)
		expect((final as any).nativeArgs?.result).toBe("Restart the backend server")
	})

	it("5. partial-json recovers a truncated string value during streaming (source of the truncated text)", () => {
		const id = "toolu_trunc_3"
		NativeToolCallParser.startStreamingToolCall(id, "attempt_completion")

		// Mid-stream: string value is open but not yet terminated
		const partial = NativeToolCallParser.processStreamingChunk(
			id,
			'{"result": "Fix backend/.env — added AWS_PROFILE=jai. Restart the backend server',
		)

		expect(partial).not.toBeNull()
		const partialResult = (partial as any)?.nativeArgs?.result as string | undefined
		// eslint-disable-next-line no-console
		console.log("[debug] partial-json recovered:", JSON.stringify(partialResult))
		expect(partialResult).toContain("Restart the backend server")
	})

	it("6. chunk-boundary safety: multi-byte characters split across deltas must not corrupt the result", () => {
		const resultWithEmoji = "Done ✅ — uploaded to S3 bucket. Restart the backend server 🚀"
		const args = JSON.stringify({ result: resultWithEmoji })

		// Feed 7-byte chunks to force splitting multi-byte UTF-8 sequences
		// (as seen with some providers that chunk on bytes, not code points)
		const { final } = simulateStream("toolu_utf8_1", "attempt_completion", args, 7)

		expect(final).not.toBeNull()
		const nativeArgs = (final as any)?.nativeArgs as { result: string } | undefined
		expect(nativeArgs?.result).toBe(resultWithEmoji)
	})

	it("7. very long result (typical completion size) survives full streaming", () => {
		const longResult = Array.from(
			{ length: 60 },
			(_, i) => `Step ${i + 1}: edited file_${i}.ts to fix migration ordering issue number ${i + 1}.`,
		).join("\n")
		const args = JSON.stringify({ result: longResult })

		const { final } = simulateStream("toolu_long_1", "attempt_completion", args, 512)

		expect(final).not.toBeNull()
		const nativeArgs = (final as any)?.nativeArgs as { result: string } | undefined
		expect(nativeArgs?.result).toBe(longResult)
		expect(nativeArgs?.result.endsWith("{")).toBe(false)
	})

	it("8. result containing literal JSON braces must not confuse the parser", () => {
		const resultWithBraces = 'Config looks like {"AWS_PROFILE": "jai"} — restart the backend server'
		const args = JSON.stringify({ result: resultWithBraces })

		const { final } = simulateStream("toolu_braces_1", "attempt_completion", args, 13)

		expect(final).not.toBeNull()
		const nativeArgs = (final as any)?.nativeArgs as { result: string } | undefined
		expect(nativeArgs?.result).toBe(resultWithBraces)
	})
})
