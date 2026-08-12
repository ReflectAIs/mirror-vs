import { render, screen, act } from "@/utils/test-utils"

import {
	type ProviderSettings,
	type ExperimentId,
	type ExtensionState,
	type MirrorMessage,
	DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
} from "@mirror-vs/types"

import { ExtensionStateContextProvider, useExtensionState, mergeExtensionState } from "../ExtensionStateContext"

const TestComponent = () => {
	const { allowedCommands, setAllowedCommands, soundEnabled, showMirrorIgnoredFiles, setShowMirrorIgnoredFiles } =
		useExtensionState()

	return (
		<div>
			<div data-testid="allowed-commands">{JSON.stringify(allowedCommands)}</div>
			<div data-testid="sound-enabled">{JSON.stringify(soundEnabled)}</div>
			<div data-testid="show-mirrorignored-files">{JSON.stringify(showMirrorIgnoredFiles)}</div>
			<button data-testid="update-button" onClick={() => setAllowedCommands(["npm install", "git status"])}>
				Update Commands
			</button>
			<button
				data-testid="toggle-mirrorignore-button"
				onClick={() => setShowMirrorIgnoredFiles(!showMirrorIgnoredFiles)}>
				Update Commands
			</button>
		</div>
	)
}

const ApiConfigTestComponent = () => {
	const { apiConfiguration, setApiConfiguration } = useExtensionState()

	return (
		<div>
			<div data-testid="api-configuration">{JSON.stringify(apiConfiguration)}</div>
			<button
				data-testid="update-api-config-button"
				onClick={() => setApiConfiguration({ apiModelId: "new-model", apiProvider: "anthropic" })}>
				Update API Config
			</button>
			<button data-testid="partial-update-button" onClick={() => setApiConfiguration({ modelTemperature: 0.7 })}>
				Partial Update
			</button>
		</div>
	)
}

describe("ExtensionStateContext", () => {
	it("initializes with empty allowedCommands array", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual([])
	})

	it("initializes with soundEnabled set to false", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("sound-enabled").textContent!)).toBe(false)
	})

	it("initializes with showMirrorIgnoredFiles set to true", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		expect(JSON.parse(screen.getByTestId("show-mirrorignored-files").textContent!)).toBe(true)
	})

	it("updates showMirrorIgnoredFiles through setShowMirrorIgnoredFiles", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			screen.getByTestId("toggle-mirrorignore-button").click()
		})

		expect(JSON.parse(screen.getByTestId("show-mirrorignored-files").textContent!)).toBe(false)
	})

	it("updates allowedCommands through setAllowedCommands", () => {
		render(
			<ExtensionStateContextProvider>
				<TestComponent />
			</ExtensionStateContextProvider>,
		)

		act(() => {
			screen.getByTestId("update-button").click()
		})

		expect(JSON.parse(screen.getByTestId("allowed-commands").textContent!)).toEqual(["npm install", "git status"])
	})

	it("throws error when used outside provider", () => {
		// Suppress console.error for this test since we expect an error
		const consoleSpy = vi.spyOn(console, "error")
		consoleSpy.mockImplementation(() => {})

		expect(() => {
			render(<TestComponent />)
		}).toThrow("useExtensionState must be used within an ExtensionStateContextProvider")

		consoleSpy.mockRestore()
	})

	it("updates apiConfiguration through setApiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		const initialContent = screen.getByTestId("api-configuration").textContent!
		expect(initialContent).toBeDefined()

		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")

		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)
	})

	it("correctly merges partial updates to apiConfiguration", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiConfigTestComponent />
			</ExtensionStateContextProvider>,
		)

		// First set the initial configuration
		act(() => {
			screen.getByTestId("update-api-config-button").click()
		})

		// Verify initial update
		const initialContent = screen.getByTestId("api-configuration").textContent!
		const initialConfig = JSON.parse(initialContent || "{}")
		expect(initialConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model",
				apiProvider: "anthropic",
			}),
		)

		// Now perform a partial update
		act(() => {
			screen.getByTestId("partial-update-button").click()
		})

		// Verify that the partial update was merged with the existing configuration
		const updatedContent = screen.getByTestId("api-configuration").textContent!
		const updatedConfig = JSON.parse(updatedContent || "{}")
		expect(updatedConfig).toEqual(
			expect.objectContaining({
				apiModelId: "new-model", // Should retain this from previous update
				apiProvider: "anthropic", // Should retain this from previous update
				modelTemperature: 0.7, // Should add this from partial update
			}),
		)
	})
})

describe("mergeExtensionState", () => {
	it("should correctly merge extension states", () => {
		const baseState: ExtensionState = {
			version: "",
			mcpEnabled: false,
			mirrorMessages: [],
			fileEdits: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			enableCheckpoints: true,
			writeDelayMs: 1000,
			mode: "default",
			experiments: {} as Record<ExperimentId, boolean>,
			customModes: [],
			maxOpenTabsContext: 20,
			maxWorkspaceFiles: 100,
			apiConfiguration: { providerId: "openrouter" } as ProviderSettings,
			showMirrorIgnoredFiles: true,
			enableSubfolderRules: false,
			renderContext: "sidebar",
			organizationAllowList: { allowAll: true, providers: {} },
			autoCondenseContext: true,
			autoCondenseContextPercent: 100,
			profileThresholds: {},
			hasOpenedModeSelector: false, // Add the new required property
			maxImageFileSize: 5,
			maxTotalImageSize: 20,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS, // Add the checkpoint timeout property
			maxReadFileLine: -1,
			activeTerminalCount: 0,
			activeTerminals: [],
			tabs: [],
			activeTabId: "",
		}

		const prevState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxTokens: 1234, modelMaxThinkingTokens: 123 },
			experiments: {} as Record<ExperimentId, boolean>,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS - 5,
		}

		const newState: ExtensionState = {
			...baseState,
			apiConfiguration: { modelMaxThinkingTokens: 456, modelTemperature: 0.3 },
			experiments: {
				preventFocusDisruption: false,
				txt2img: false,
				img2img: false,
				inpaint: false,
				outpaint: false,
				upscale: false,
				"remove-bg": false,
				txt2audio: false,
				txt2video: false,
				runSlashCommand: false,
				customTools: false,
			} as Record<ExperimentId, boolean>,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS + 5,
		}

		const result = mergeExtensionState(prevState, newState)

		expect(result.apiConfiguration).toEqual({
			modelMaxThinkingTokens: 456,
			modelTemperature: 0.3,
		})

		expect(result.experiments).toEqual({
			preventFocusDisruption: false,
			txt2img: false,
			img2img: false,
			inpaint: false,
			outpaint: false,
			upscale: false,
			"remove-bg": false,
			txt2audio: false,
			txt2video: false,
			runSlashCommand: false,
			customTools: false,
		})
	})

	describe("mirrorMessagesSeq protection", () => {
		const baseState: ExtensionState = {
			version: "",
			mcpEnabled: false,
			mirrorMessages: [],
			fileEdits: [],
			taskHistory: [],
			shouldShowAnnouncement: false,
			enableCheckpoints: true,
			writeDelayMs: 1000,
			mode: "default",
			experiments: {} as Record<ExperimentId, boolean>,
			customModes: [],
			maxOpenTabsContext: 20,
			maxWorkspaceFiles: 100,
			apiConfiguration: {},
			showMirrorIgnoredFiles: true,
			enableSubfolderRules: false,
			renderContext: "sidebar",
			organizationAllowList: { allowAll: true, providers: {} },
			autoCondenseContext: true,
			autoCondenseContextPercent: 100,
			profileThresholds: {},
			hasOpenedModeSelector: false,
			maxImageFileSize: 5,
			maxTotalImageSize: 20,
			checkpointTimeout: DEFAULT_CHECKPOINT_TIMEOUT_SECONDS,
			maxReadFileLine: -1,
			activeTerminalCount: 0,
			activeTerminals: [],
			tabs: [],
			activeTabId: "",
		}

		const makeMessage = (ts: number, text: string): MirrorMessage =>
			({ ts, type: "say", say: "text", text }) as MirrorMessage

		it("rejects stale mirrorMessages when seq is not newer", () => {
			const newerMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]
			const staleMessages = [makeMessage(1, "hello")]

			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: newerMessages,
				mirrorMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				mirrorMessages: staleMessages,
				mirrorMessagesSeq: 3, // stale seq
			})

			// Should keep the newer messages
			expect(result.mirrorMessages).toBe(newerMessages)
			expect(result.mirrorMessagesSeq).toBe(5)
		})

		it("rejects mirrorMessages when seq equals current (not strictly greater)", () => {
			const currentMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]
			const sameSeqMessages = [makeMessage(1, "hello")]

			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: currentMessages,
				mirrorMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				mirrorMessages: sameSeqMessages,
				mirrorMessagesSeq: 5, // same seq, not strictly greater
			})

			expect(result.mirrorMessages).toBe(currentMessages)
			expect(result.mirrorMessagesSeq).toBe(5)
		})

		it("accepts mirrorMessages when seq is strictly greater", () => {
			const oldMessages = [makeMessage(1, "hello")]
			const newMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: oldMessages,
				mirrorMessagesSeq: 3,
			}

			const result = mergeExtensionState(prevState, {
				mirrorMessages: newMessages,
				mirrorMessagesSeq: 4, // newer seq
			})

			expect(result.mirrorMessages).toBe(newMessages)
			expect(result.mirrorMessagesSeq).toBe(4)
		})

		it("preserves mirrorMessages when newState does not include them", () => {
			const existingMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: existingMessages,
				mirrorMessagesSeq: 5,
			}

			const result = mergeExtensionState(prevState, {
				currentApiConfigName: "updated",
			})

			expect(result.mirrorMessages).toBe(existingMessages)
			expect(result.mirrorMessagesSeq).toBe(5)
		})

		it("applies mirrorMessages normally when neither state has seq (backward compat)", () => {
			const oldMessages = [makeMessage(1, "hello")]
			const newMessages = [makeMessage(1, "hello"), makeMessage(2, "world")]

			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: oldMessages,
			}

			const result = mergeExtensionState(prevState, {
				mirrorMessages: newMessages,
			})

			expect(result.mirrorMessages).toBe(newMessages)
		})

		it("applies mirrorMessages when prevState has no seq but newState does (first push)", () => {
			const prevState: ExtensionState = {
				...baseState,
				mirrorMessages: [],
			}

			const newMessages = [makeMessage(1, "hello")]
			const result = mergeExtensionState(prevState, {
				mirrorMessages: newMessages,
				mirrorMessagesSeq: 1,
			})

			expect(result.mirrorMessages).toBe(newMessages)
			expect(result.mirrorMessagesSeq).toBe(1)
		})
	})
})
