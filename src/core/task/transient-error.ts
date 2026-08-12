/**
 * Detects transient provider failures that are safe to auto-retry with backoff.
 *
 * Covers HTTP 429 (rate limit), 529 (overloaded_error — "The provider couldn't
 * process the request as made."), and 503 (service unavailable), plus matching
 * error codes/messages. These are provider-capacity failures that resolve on
 * their own, so concurrent tabs should back off and retry rather than dumping
 * the raw error on the user.
 */
export function isTransientProviderError(error: unknown): boolean {
	const anyErr = error as any

	// Prefer HTTP status when present (Anthropic/OpenAI SDK errors carry .status)
	const status = anyErr?.status
	if (typeof status === "number") {
		if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) {
			return true
		}
	}

	// Fall back to error code (e.g. "overloaded_error", "rate_limit_exceeded")
	const code = typeof anyErr?.code === "string" ? anyErr.code.toLowerCase() : ""
	if (code) {
		if (
			code.includes("overload") ||
			code.includes("rate_limit") ||
			code.includes("too_many") ||
			code.includes("busy") ||
			code.includes("unavailable") ||
			code.includes("capacity") ||
			code.includes("provider_error")
		) {
			return true
		}
	}

	// Last resort: inspect the message text
	const message = typeof anyErr?.message === "string" ? anyErr.message.toLowerCase() : ""
	return (
		message.includes("couldn't process") ||
		message.includes("could not process") ||
		message.includes("request as made") ||
		message.includes("overloaded") ||
		message.includes("rate limit") ||
		message.includes("too many requests") ||
		message.includes("service unavailable") ||
		message.includes("529") ||
		message.includes("503") ||
		message.includes("502") ||
		message.includes("500") ||
		message.includes("429") ||
		message.includes("busy") ||
		message.includes("try again") ||
		message.includes("capacity") ||
		message.includes("provider error")
	)
}
