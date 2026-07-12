import * as vscode from "vscode"

import { type WebviewMessage } from "@mirror-vs/types"

import { MirrorProvider } from "../MirrorProvider"

/**
 * Handles signing in to OpenAI Codex via OAuth.
 */
export async function handleOpenAiCodexSignIn(provider: MirrorProvider): Promise<void> {
	try {
		const { openAiCodexOAuthManager } = await import("../../../integrations/openai-codex/oauth")
		const authUrl = openAiCodexOAuthManager.startAuthorizationFlow()

		await vscode.env.openExternal(vscode.Uri.parse(authUrl))

		openAiCodexOAuthManager
			.waitForCallback()
			.then(async () => {
				vscode.window.showInformationMessage("Successfully signed in to OpenAI Codex")
				await provider.postStateToWebview()
			})
			.catch((error: any) => {
				provider.log(`OpenAI Codex OAuth callback failed: ${error}`)
				if (!String(error).includes("timed out")) {
					vscode.window.showErrorMessage(`OpenAI Codex sign in failed: ${error.message || error}`)
				}
			})
	} catch (error) {
		provider.log(`OpenAI Codex OAuth failed: ${error}`)
		vscode.window.showErrorMessage("OpenAI Codex sign in failed.")
	}
}

/**
 * Handles signing out of OpenAI Codex.
 */
export async function handleOpenAiCodexSignOut(provider: MirrorProvider): Promise<void> {
	try {
		const { openAiCodexOAuthManager } = await import("../../../integrations/openai-codex/oauth")
		await openAiCodexOAuthManager.clearCredentials()
		vscode.window.showInformationMessage("Signed out from OpenAI Codex")
		await provider.postStateToWebview()
	} catch (error) {
		provider.log(`OpenAI Codex sign out failed: ${error}`)
		vscode.window.showErrorMessage("OpenAI Codex sign out failed.")
	}
}

/**
 * Handles requesting OpenAI Codex rate limits.
 */
export async function handleRequestOpenAiCodexRateLimits(provider: MirrorProvider): Promise<void> {
	try {
		const { openAiCodexOAuthManager } = await import("../../../integrations/openai-codex/oauth")
		const accessToken = await openAiCodexOAuthManager.getAccessToken()

		if (!accessToken) {
			provider.postMessageToWebview({
				type: "openAiCodexRateLimits",
				error: "Not authenticated with OpenAI Codex",
			})
			return
		}

		const accountId = await openAiCodexOAuthManager.getAccountId()
		const { fetchOpenAiCodexRateLimitInfo } = await import("../../../integrations/openai-codex/rate-limits")
		const rateLimits = await fetchOpenAiCodexRateLimitInfo(accessToken, { accountId })

		provider.postMessageToWebview({
			type: "openAiCodexRateLimits",
			values: rateLimits,
		})
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error)
		provider.log(`Error fetching OpenAI Codex rate limits: ${errorMessage}`)
		provider.postMessageToWebview({
			type: "openAiCodexRateLimits",
			error: errorMessage,
		})
	}
}
