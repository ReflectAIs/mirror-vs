import React, { Component } from "react"
import type { MirrorMessage } from "@mirror-vs/types"
import { vscode } from "@/utils/vscode"

interface ChatRowErrorBoundaryProps {
	children: React.ReactNode
	message: MirrorMessage
}

interface ChatRowErrorBoundaryState {
	hasError: boolean
	error?: Error
	errorInfo?: React.ErrorInfo
	showDetails: boolean
	copied: boolean
}

export class ChatRowErrorBoundary extends Component<ChatRowErrorBoundaryProps, ChatRowErrorBoundaryState> {
	constructor(props: ChatRowErrorBoundaryProps) {
		super(props)
		this.state = {
			hasError: false,
			showDetails: false,
			copied: false,
		}
	}

	static getDerivedStateFromError(error: Error): Partial<ChatRowErrorBoundaryState> {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({ errorInfo })

		try {
			vscode.postMessage({
				type: "webviewError",
				error: {
					message: `ChatRow render error (ts: ${this.props.message.ts}, type: ${this.props.message.type}, say: ${this.props.message.say || ""}): ${error.message}`,
					stack: error.stack,
					componentStack: errorInfo.componentStack || undefined,
				},
			})
		} catch (e) {
			console.error("Failed to post message error to VS Code", e)
		}
	}

	private handleRetry = () => {
		this.setState({ hasError: false, error: undefined, errorInfo: undefined, showDetails: false })
	}

	private handleCopy = () => {
		const text = `Message: ts=${this.props.message.ts} type=${this.props.message.type} say=${this.props.message.say}\n\nError:\n${this.state.error?.stack || this.state.error?.message || ""}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack || ""}`
		navigator.clipboard.writeText(text).then(() => {
			this.setState({ copied: true })
			setTimeout(() => this.setState({ copied: false }), 2000)
		})
	}

	render() {
		if (!this.state.hasError) {
			return this.props.children
		}

		return (
			<div className="my-2 p-3 rounded border border-[var(--vscode-inputValidation-warningBorder)] bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-foreground)] text-xs">
				<div className="flex items-center justify-between gap-2 mb-2">
					<div className="flex items-center gap-1.5 font-medium text-[var(--vscode-warningForeground)]">
						<span className="codicon codicon-warning" />
						<span>Error rendering this message</span>
					</div>
					<div className="flex items-center gap-1.5">
						<button
							type="button"
							onClick={this.handleRetry}
							className="px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] cursor-pointer">
							Retry
						</button>
						<button
							type="button"
							onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
							className="px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] cursor-pointer">
							{this.state.showDetails ? "Hide" : "Details"}
						</button>
						<button
							type="button"
							onClick={this.handleCopy}
							className="px-2 py-0.5 rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] cursor-pointer"
							title="Copy error details">
							<span className={`codicon ${this.state.copied ? "codicon-check" : "codicon-copy"}`} />
						</button>
					</div>
				</div>

				{this.state.showDetails && (
					<div className="mt-2 pt-2 border-t border-[var(--vscode-inputValidation-warningBorder)]">
						<pre className="p-2 rounded bg-[var(--vscode-editor-background)] text-[var(--vscode-editor-foreground)] font-mono text-[11px] overflow-auto max-h-36 whitespace-pre-wrap">
							{this.state.error?.stack || this.state.error?.message || "Unknown error"}
						</pre>
					</div>
				)}
			</div>
		)
	}
}
