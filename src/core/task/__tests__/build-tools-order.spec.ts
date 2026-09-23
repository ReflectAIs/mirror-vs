import { describe, it, expect, vi } from "vitest"
import { buildNativeToolsArrayWithRestrictions } from "../build-tools"

describe("buildNativeToolsArrayWithRestrictions deterministic ordering", () => {
	it("sorts tools alphabetically by function name to guarantee stable prompt cache keys", async () => {
		const mockProvider = {
			context: {},
			getMcpHub: () => ({
				getServers: () => [],
				getProviderThreshold: () => 0,
			}),
		} as any

		const result1 = await buildNativeToolsArrayWithRestrictions({
			provider: mockProvider,
			cwd: "/test/cwd",
			mode: "code",
			customModes: undefined,
			experiments: undefined,
			apiConfiguration: undefined,
		})

		const toolNames = result1.tools.map((t: any) => t.function.name)
		const sortedNames = [...toolNames].sort((a, b) => a.localeCompare(b))

		// The tools array must already be strictly sorted alphabetically
		expect(toolNames).toEqual(sortedNames)
	})

	it("sorts allTools alphabetically when includeAllToolsWithRestrictions is true", async () => {
		const mockProvider = {
			context: {},
			getMcpHub: () => ({
				getServers: () => [],
				getProviderThreshold: () => 0,
			}),
		} as any

		const result = await buildNativeToolsArrayWithRestrictions({
			provider: mockProvider,
			cwd: "/test/cwd",
			mode: "architect",
			customModes: undefined,
			experiments: undefined,
			apiConfiguration: undefined,
			includeAllToolsWithRestrictions: true,
		})

		const allNames = result.tools.map((t: any) => t.function.name)
		const sortedAllNames = [...allNames].sort((a, b) => a.localeCompare(b))

		expect(allNames).toEqual(sortedAllNames)
	})
})
