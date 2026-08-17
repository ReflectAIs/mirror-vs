import { getToolUseGuidelinesSection } from "../tool-use-guidelines"

describe("getToolUseGuidelinesSection", () => {
	it("should include tool selection guidelines", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("## Tool Selection Guidelines")
		expect(guidelines).toContain("Read code:")
		expect(guidelines).toContain("Search code:")
		expect(guidelines).toContain("Edit code:")
		expect(guidelines).toContain("Web info:")
		expect(guidelines).toContain("Refresh context:")
	})

	it("should include truncation handling guidance", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("Truncated files:")
		expect(guidelines).toContain("Truncated terminal output:")
		expect(guidelines).toContain("read_command_output")
	})

	it("should include batching rules", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("## Batching Rules")
		expect(guidelines).toContain("can be batched in parallel")
		expect(guidelines).toContain("writes must be sequential")
	})

	it("should include non-interactive execution guidance", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).toContain("Non-interactive execution")
		expect(guidelines).toContain("--progress=plain")
	})

	it("should not reference placeholder tool names or per-tool confirmation guidelines", () => {
		const guidelines = getToolUseGuidelinesSection()

		expect(guidelines).not.toContain("<actual_tool_name>")
		expect(guidelines).not.toContain("After each tool use, the user will respond with the result")
	})
})
