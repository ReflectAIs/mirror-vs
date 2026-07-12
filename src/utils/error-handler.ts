import * as vscode from "vscode"

/**
 * Severity levels for error reporting.
 */
export type ErrorSeverity = "info" | "warning" | "error" | "critical"

/**
 * A recovery suggestion attached to an error report.
 */
export interface RecoverySuggestion {
	label: string
	action: () => Promise<void> | void
}

/**
 * Structured error report with context, severity, and recovery options.
 */
export interface ErrorReport {
	/** Unique identifier for deduplication */
	readonly id: string
	/** Human-readable title (shown in notification) */
	title: string
	/** Detailed message */
	message: string
	/** Severity level */
	severity: ErrorSeverity
	/** Source module / component that raised the error */
	source: string
	/** Optional stack trace */
	stack?: string
	/** Timestamp when the error occurred */
	timestamp: Date
	/** Optional recovery suggestions */
	suggestions?: RecoverySuggestion[]
	/** Optional structured context data */
	context?: Record<string, unknown>
}

/**
 * Options for reporting an error.
 */
export interface ReportErrorOptions {
	/** Severity override (default: "error") */
	severity?: ErrorSeverity
	/** Source module identifier */
	source?: string
	/** Recovery suggestions */
	suggestions?: RecoverySuggestion[]
	/** Additional context data */
	context?: Record<string, unknown>
	/** If true, suppress user-facing notification */
	silent?: boolean
}

/**
 * Centralized error handler for Mirror VS.
 *
 * Responsibilities:
 * - Collect errors with structured context
 * - Log to console with consistent formatting
 * - Show user-facing notifications (with severity-appropriate UI)
 * - Offer recovery suggestions
 * - Prevent duplicate error spam
 */
export class ErrorHandler {
	private static readonly MAX_RECENT_ERRORS = 50
	private static readonly DEDUP_WINDOW_MS = 5_000

	/** Ring buffer of recent error IDs to prevent duplicate notifications */
	private static recentErrors: Map<string, number> = new Map()

	/** Registered listeners for error events */
	private static listeners: Array<(report: ErrorReport) => void> = []

	private static errorCount = 0

	/**
	 * Report an error to the central handler.
	 *
	 * @param errorOrMessage - The Error object or a plain string message
	 * @param options - Additional context and behaviour options
	 * @returns The created ErrorReport
	 */
	public static report(errorOrMessage: Error | string, options: ReportErrorOptions = {}): ErrorReport {
		const isError = errorOrMessage instanceof Error
		const message = isError ? errorOrMessage.message : errorOrMessage
		const stack = isError ? errorOrMessage.stack : undefined

		const report: ErrorReport = {
			id: this.generateId(message, options.source),
			title: this.formatTitle(message, options.source),
			message,
			severity: options.severity ?? "error",
			source: options.source ?? "unknown",
			stack,
			timestamp: new Date(),
			suggestions: options.suggestions,
			context: options.context,
		}

		this.errorCount++

		// Deduplication check — skip if same error was reported recently
		const lastReported = this.recentErrors.get(report.id)
		if (lastReported && Date.now() - lastReported < this.DEDUP_WINDOW_MS) {
			return report
		}
		this.recentErrors.set(report.id, Date.now())

		// Trim ring buffer
		if (this.recentErrors.size > this.MAX_RECENT_ERRORS) {
			const oldest = Array.from(this.recentErrors.entries()).sort((a, b) => a[1] - b[1])[0]
			if (oldest) {
				this.recentErrors.delete(oldest[0])
			}
		}

		// Log to console
		this.log(report)

		// Notify listeners
		for (const listener of this.listeners) {
			try {
				listener(report)
			} catch {
				// Swallow listener errors to avoid cascading failures
			}
		}

		// Show user-facing notification (unless silent)
		if (!options.silent) {
			this.notify(report)
		}

		return report
	}

	/**
	 * Convert an Error into a user-facing VS Code notification with
	 * optional recovery actions.
	 */
	private static notify(report: ErrorReport): void {
		const actions = report.suggestions ?? []
		const buttons = actions.map((s) => s.label)

		switch (report.severity) {
			case "critical":
			case "error": {
				if (buttons.length > 0) {
					vscode.window.showErrorMessage(report.title, ...buttons).then((selection) => {
						if (selection) {
							const action = actions.find((s) => s.label === selection)
							action?.action()
						}
					})
				} else {
					vscode.window.showErrorMessage(report.title)
				}
				break
			}
			case "warning": {
				if (buttons.length > 0) {
					vscode.window.showWarningMessage(report.title, ...buttons).then((selection) => {
						if (selection) {
							const action = actions.find((s) => s.label === selection)
							action?.action()
						}
					})
				} else {
					vscode.window.showWarningMessage(report.title)
				}
				break
			}
			case "info": {
				if (buttons.length > 0) {
					vscode.window.showInformationMessage(report.title, ...buttons).then((selection) => {
						if (selection) {
							const action = actions.find((s) => s.label === selection)
							action?.action()
						}
					})
				} else {
					vscode.window.showInformationMessage(report.title)
				}
				break
			}
		}
	}

	/**
	 * Format a title string from the error message and source.
	 */
	private static formatTitle(message: string, source?: string): string {
		const prefix = source ? `[${source}]` : "[Mirror VS]"
		// Truncate long messages for notification display
		const truncated = message.length > 120 ? message.slice(0, 117) + "..." : message
		return `${prefix} ${truncated}`
	}

	/**
	 * Generate a deduplication ID from the message and source.
	 */
	private static generateId(message: string, source?: string): string {
		// Normalise: lowercase, strip variable parts like timestamps
		const normalized = message.toLowerCase().replace(/\d+/g, "#").trim()
		return source ? `${source}::${normalized}` : normalized
	}

	/**
	 * Write a structured log entry to the console.
	 */
	private static log(report: ErrorReport): void {
		const prefix = `[ErrorHandler/${report.severity.toUpperCase()}]`
		console.group(`${prefix} ${report.source}`)
		console.error(`Message: ${report.message}`)
		if (report.stack) {
			console.error(`Stack: ${report.stack}`)
		}
		if (report.context && Object.keys(report.context).length > 0) {
			console.error("Context:", report.context)
		}
		if (report.suggestions && report.suggestions.length > 0) {
			console.error(`Suggestions: ${report.suggestions.map((s) => s.label).join(", ")}`)
		}
		console.groupEnd()
	}

	/**
	 * Register a listener that is called for every reported error.
	 * Returns an unsubscribe function.
	 */
	public static onError(listener: (report: ErrorReport) => void): () => void {
		this.listeners.push(listener)
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener)
		}
	}

	/**
	 * Wrap an async function with automatic error reporting.
	 * The function is re-thrown after reporting unless `swallow` is true.
	 */
	public static async wrap<T>(
		fn: () => Promise<T>,
		options: ReportErrorOptions & { swallow?: boolean } = {},
	): Promise<T | undefined> {
		try {
			return await fn()
		} catch (error) {
			this.report(error instanceof Error ? error : String(error), options)
			if (!options.swallow) {
				throw error
			}
			return undefined
		}
	}

	/**
	 * Create a recovery suggestion helper.
	 */
	public static suggestion(label: string, action: () => Promise<void> | void): RecoverySuggestion {
		return { label, action }
	}

	/**
	 * Get the total number of errors reported since startup.
	 */
	public static get totalErrorCount(): number {
		return this.errorCount
	}

	/**
	 * Reset the deduplication buffer (useful in tests).
	 */
	public static reset(): void {
		this.recentErrors.clear()
		this.listeners = []
		this.errorCount = 0
	}
}

/**
 * Convenience function to report an error.
 */
export function reportError(errorOrMessage: Error | string, options: ReportErrorOptions = {}): ErrorReport {
	return ErrorHandler.report(errorOrMessage, options)
}
