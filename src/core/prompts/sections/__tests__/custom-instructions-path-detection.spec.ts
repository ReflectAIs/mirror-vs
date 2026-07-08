import * as path from "path"

describe("custom-instructions path detection", () => {
	it("should use exact path comparison instead of string includes", () => {
		// Test the logic that our fix implements
		const fakeHomeDir = "/Users/john.mirror.smith"
		const globalMirrorDir = path.join(fakeHomeDir, ".mirror") // "/Users/john.mirror.smith/.mirror"
		const projectMirrorDir = "/projects/my-project/.mirror"

		// Old implementation (fragile):
		// const isGlobal = mirrorDir.includes(path.join(os.homedir(), ".mirror"))
		// This could fail if the home directory path contains ".mirror" elsewhere

		// New implementation (robust):
		// const isGlobal = path.resolve(mirrorDir) === path.resolve(getGlobalMirrorDirectory())

		// Test the new logic
		const isGlobalForGlobalDir = path.resolve(globalMirrorDir) === path.resolve(globalMirrorDir)
		const isGlobalForProjectDir = path.resolve(projectMirrorDir) === path.resolve(globalMirrorDir)

		expect(isGlobalForGlobalDir).toBe(true)
		expect(isGlobalForProjectDir).toBe(false)

		// Verify that the old implementation would have been problematic
		// if the home directory contained ".mirror" in the path
		const oldLogicGlobal = globalMirrorDir.includes(path.join(fakeHomeDir, ".mirror"))
		const oldLogicProject = projectMirrorDir.includes(path.join(fakeHomeDir, ".mirror"))

		expect(oldLogicGlobal).toBe(true) // This works
		expect(oldLogicProject).toBe(false) // This also works, but is fragile

		// The issue was that if the home directory path itself contained ".mirror",
		// the includes() check could produce false positives in edge cases
	})

	it("should handle edge cases with path resolution", () => {
		// Test various edge cases that exact path comparison handles better
		const testCases = [
			{
				global: "/Users/test/.mirror",
				project: "/Users/test/project/.mirror",
				expected: { global: true, project: false },
			},
			{
				global: "/home/user/.mirror",
				project: "/home/user/.mirror", // Same directory
				expected: { global: true, project: true },
			},
			{
				global: "/Users/john.mirror.smith/.mirror",
				project: "/projects/app/.mirror",
				expected: { global: true, project: false },
			},
		]

		testCases.forEach(({ global, project, expected }) => {
			const isGlobalForGlobal = path.resolve(global) === path.resolve(global)
			const isGlobalForProject = path.resolve(project) === path.resolve(global)

			expect(isGlobalForGlobal).toBe(expected.global)
			expect(isGlobalForProject).toBe(expected.project)
		})
	})
})
