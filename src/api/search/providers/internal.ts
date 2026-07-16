import type { HealthStatus, SearchResult, SearchOptions, ProviderCapabilities } from "../types"
import type { SearchProvider } from "../provider"
import * as vscode from "vscode"
import * as path from "path"

export class InternalSearchProvider implements SearchProvider {
	readonly name = "Internal Search"

	async health(): Promise<HealthStatus> {
		return { alive: true, message: "Workspace active" }
	}

	async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
		const maxResults = options?.maxResults ?? 5
		const results: SearchResult[] = []

		// Search workspace files using VS Code workspace search api
		const cleanQuery = query.replace(/\s*site:\S+/g, "").trim()
		if (!cleanQuery) return []

		const files = await vscode.workspace.findFiles("**/*", "**/node_modules/**", maxResults * 2)

		for (const file of files) {
			if (results.length >= maxResults) break
			try {
				const doc = await vscode.workspace.openTextDocument(file)
				const content = doc.getText()
				const index = content.toLowerCase().indexOf(cleanQuery.toLowerCase())
				if (index !== -1) {
					const snippetStart = Math.max(0, index - 60)
					const snippetEnd = Math.min(content.length, index + cleanQuery.length + 60)
					const snippet = content.slice(snippetStart, snippetEnd).replace(/\r?\n/g, " ").trim()

					results.push({
						title: path.basename(file.fsPath),
						url: file.toString(),
						snippet: `... ${snippet} ...`,
					})
				}
			} catch {
				// Ignore unreadable binary files
			}
		}

		return results
	}

	getCapabilities(): ProviderCapabilities {
		return {
			supportsWebSearch: false,
			supportsNewsSearch: false,
			supportsImageSearch: false,
			supportsVideoSearch: false,
			supportsSafeSearch: false,
			supportsFreshnessFiltering: false,
			supportsLocaleFiltering: false,
		}
	}
}
