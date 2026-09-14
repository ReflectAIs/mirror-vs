import React, { Component } from "react"
import { enhanceErrorWithSourceMaps } from "@src/utils/sourceMapUtils"
import { vscode } from "@/utils/vscode"

type ErrorProps = {
	children: React.ReactNode
}

type ErrorState = {
	error?: string
	componentStack?: string | null
	timestamp?: number
	copied?: boolean
}

class ErrorBoundary extends Component<ErrorProps, ErrorState> {
	constructor(props: ErrorProps) {
		super(props)
		this.state = {}
	}

	static getDerivedStateFromError(error: unknown) {
		let errorMessage = ""

		if (error instanceof Error) {
			errorMessage = error.stack ?? error.message
		} else {
			errorMessage = `${error}`
		}

		return {
			error: errorMessage,
			timestamp: Date.now(),
		}
	}

	async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		const componentStack = errorInfo.componentStack || ""
		let enhancedError: { sourceMappedStack?: string; sourceMappedComponentStack?: string } = {
			sourceMappedStack: error.stack,
			sourceMappedComponentStack: componentStack,
		}
		try {
			enhancedError = await enhanceErrorWithSourceMaps(error, componentStack)
		} catch {
			// ignore sourcemap errors
		}

		const finalStack = enhancedError.sourceMappedStack || error.stack || error.message
		const finalComponentStack = enhancedError.sourceMappedComponentStack || componentStack

		this.setState({
			error: finalStack,
			componentStack: finalComponentStack,
		})

		// Notify extension host so it appears in OutputChannel ('Mirror-VS')
		try {
			vscode.postMessage({
				type: "webviewError",
				error: {
					message: error.message || "React error boundary triggered",
					stack: finalStack,
					componentStack: finalComponentStack,
				},
			})
		} catch (e) {
			console.error("Failed to post webview error to VS Code", e)
		}
	}

	private safeT(_key: string, fallback: string): string {
		return fallback
	}

	private handleReload = () => {
		vscode.postMessage({ type: "reloadWebview" })
	}

	private handleTryAgain = () => {
		this.setState({ error: undefined, componentStack: undefined })
	}

	private handleCopy = () => {
		const text = `Error:\n${this.state.error || ""}\n\nComponent Stack:\n${this.state.componentStack || ""}`
		navigator.clipboard.writeText(text).then(() => {
			this.setState({ copied: true })
			setTimeout(() => this.setState({ copied: false }), 2000)
		})
	}

	render() {
		if (!this.state.error) {
			return this.props.children
		}

		const errorDisplay = this.state.error
		const componentStackDisplay = this.state.componentStack
		const version = process.env.PKG_VERSION || "unknown"

		return (
			<div className="p-4 overflow-auto h-screen flex flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]">
				<div className="flex items-center gap-2 mb-3">
					<div className="codicon codicon-warning text-xl text-[var(--vscode-errorForeground)]" />
					<h2 className="text-base font-bold m-0 text-[var(--vscode-foreground)]">
						{this.safeT("errorBoundary.title", "An unexpected error occurred")} (v{version})
					</h2>
				</div>

				<p className="mb-3 text-xs text-[var(--vscode-descriptionForeground)]">
					{this.safeT("errorBoundary.reportText", "If this keeps happening, please report it to our")}{" "}
					<a
						href="https://github.com/ReflectAIs/mirror-vs/issues"
						target="_blank"
						rel="noreferrer"
						className="text-[var(--vscode-textLink-foreground)] underline">
						{this.safeT("errorBoundary.githubText", "GitHub Issues")}
					</a>
					.
				</p>

				{/* Action buttons: Reload Webview and Try Again */}
				<div className="flex flex-wrap gap-2 mb-4">
					<button
						type="button"
						onClick={this.handleReload}
						className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer flex items-center gap-1.5">
						<span className="codicon codicon-refresh" />
						Reload Webview
					</button>

					<button
						type="button"
						onClick={this.handleTryAgain}
						className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] cursor-pointer">
						Try Again
					</button>

					<button
						type="button"
						onClick={this.handleCopy}
						className="px-3 py-1.5 text-xs font-medium rounded bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)] cursor-pointer flex items-center gap-1.5">
						<span className={`codicon ${this.state.copied ? "codicon-check" : "codicon-copy"}`} />
						{this.state.copied ? "Copied!" : "Copy Error Details"}
					</button>
				</div>

				<div className="flex-1 overflow-auto space-y-3">
					<div>
						<h3 className="text-xs font-bold mb-1 text-[var(--vscode-foreground)]">
							{this.safeT("errorBoundary.errorStack", "Error Details")}
						</h3>
						<pre className="p-2 border border-[var(--vscode-editorWidget-border)] rounded text-xs overflow-auto bg-[var(--vscode-editor-inactiveSelectionBackground)] font-mono whitespace-pre-wrap max-h-48">
							{errorDisplay}
						</pre>
					</div>

					{componentStackDisplay && (
						<div>
							<h3 className="text-xs font-bold mb-1 text-[var(--vscode-foreground)]">
								{this.safeT("errorBoundary.componentStack", "Component Stack")}
							</h3>
							<pre className="p-2 border border-[var(--vscode-editorWidget-border)] rounded text-xs overflow-auto bg-[var(--vscode-editor-inactiveSelectionBackground)] font-mono whitespace-pre-wrap max-h-48">
								{componentStackDisplay}
							</pre>
						</div>
					)}
				</div>
			</div>
		)
	}
}

export default ErrorBoundary
