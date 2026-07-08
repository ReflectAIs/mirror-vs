import path from "path"
import { MirrorProtectedController } from "../MirrorProtectedController"

describe("MirrorProtectedController", () => {
	const TEST_CWD = "/test/workspace"
	let controller: MirrorProtectedController

	beforeEach(() => {
		controller = new MirrorProtectedController(TEST_CWD)
	})

	describe("isWriteProtected", () => {
		it("should protect .mirrorignore file", () => {
			expect(controller.isWriteProtected(".mirrorignore")).toBe(true)
		})

		it("should protect files in .mirror directory", () => {
			expect(controller.isWriteProtected(".mirror/config.json")).toBe(true)
			expect(controller.isWriteProtected(".mirror/settings/user.json")).toBe(true)
			expect(controller.isWriteProtected(".mirror/modes/custom.json")).toBe(true)
		})

		it("should protect .mirrorprotected file", () => {
			expect(controller.isWriteProtected(".mirrorprotected")).toBe(true)
		})

		it("should protect .mirrormodes files", () => {
			expect(controller.isWriteProtected(".mirrormodes")).toBe(true)
		})

		it("should protect .mirrorrules* files", () => {
			expect(controller.isWriteProtected(".mirrorrules")).toBe(true)
			expect(controller.isWriteProtected(".mirrorrules.md")).toBe(true)
		})

		it("should protect .mirrorrules* files", () => {
			expect(controller.isWriteProtected(".mirrorrules")).toBe(true)
			expect(controller.isWriteProtected(".mirrorrules.md")).toBe(true)
		})

		it("should protect files in .vscode directory", () => {
			expect(controller.isWriteProtected(".vscode/settings.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/launch.json")).toBe(true)
			expect(controller.isWriteProtected(".vscode/tasks.json")).toBe(true)
		})

		it("should protect .code-workspace files", () => {
			expect(controller.isWriteProtected("myproject.code-workspace")).toBe(true)
			expect(controller.isWriteProtected("pentest.code-workspace")).toBe(true)
			expect(controller.isWriteProtected(".code-workspace")).toBe(true)
			expect(controller.isWriteProtected("folder/workspace.code-workspace")).toBe(true)
		})

		it("should protect AGENTS.md file", () => {
			expect(controller.isWriteProtected("AGENTS.md")).toBe(true)
		})

		it("should protect AGENT.md file", () => {
			expect(controller.isWriteProtected("AGENT.md")).toBe(true)
		})

		it("should not protect other files starting with .mirror", () => {
			expect(controller.isWriteProtected(".mirrorsettings")).toBe(false)
			expect(controller.isWriteProtected(".mirrorconfig")).toBe(false)
		})

		it("should not protect regular files", () => {
			expect(controller.isWriteProtected("src/index.ts")).toBe(false)
			expect(controller.isWriteProtected("package.json")).toBe(false)
			expect(controller.isWriteProtected("README.md")).toBe(false)
		})

		it("should not protect files that contain 'mirror' but don't start with .mirror", () => {
			expect(controller.isWriteProtected("src/mirror-utils.ts")).toBe(false)
			expect(controller.isWriteProtected("config/mirror.config.js")).toBe(false)
		})

		it("should handle nested paths correctly", () => {
			expect(controller.isWriteProtected(".mirror/config.json")).toBe(true) // .mirror/** matches at root
			expect(controller.isWriteProtected("nested/.mirrorignore")).toBe(true) // .mirrorignore matches anywhere by default
			expect(controller.isWriteProtected("nested/.mirrormodes")).toBe(true) // .mirrormodes matches anywhere by default
			expect(controller.isWriteProtected("nested/.mirrorrules.md")).toBe(true) // .mirrorrules* matches anywhere by default
		})

		it("should handle absolute paths by converting to relative", () => {
			const absolutePath = path.join(TEST_CWD, ".mirrorignore")
			expect(controller.isWriteProtected(absolutePath)).toBe(true)
		})

		it("should handle paths with different separators", () => {
			expect(controller.isWriteProtected(".mirror\\config.json")).toBe(true)
			expect(controller.isWriteProtected(".mirror/config.json")).toBe(true)
		})

		it("should not throw for absolute paths outside cwd", () => {
			expect(controller.isWriteProtected("/tmp/comment-2-pr63.json")).toBe(false)
			expect(controller.isWriteProtected("/etc/passwd")).toBe(false)
		})
	})

	describe("getProtectedFiles", () => {
		it("should return set of protected files from a list", () => {
			const files = ["src/index.ts", ".mirrorignore", "package.json", ".mirror/config.json", "README.md"]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set([".mirrorignore", ".mirror/config.json"]))
		})

		it("should return empty set when no files are protected", () => {
			const files = ["src/index.ts", "package.json", "README.md"]

			const protectedFiles = controller.getProtectedFiles(files)

			expect(protectedFiles).toEqual(new Set())
		})
	})

	describe("annotatePathsWithProtection", () => {
		it("should annotate paths with protection status", () => {
			const files = ["src/index.ts", ".mirrorignore", ".mirror/config.json", "package.json"]

			const annotated = controller.annotatePathsWithProtection(files)

			expect(annotated).toEqual([
				{ path: "src/index.ts", isProtected: false },
				{ path: ".mirrorignore", isProtected: true },
				{ path: ".mirror/config.json", isProtected: true },
				{ path: "package.json", isProtected: false },
			])
		})
	})

	describe("getProtectionMessage", () => {
		it("should return appropriate protection message", () => {
			const message = controller.getProtectionMessage()
			expect(message).toBe("This is a Mirror VS configuration file and requires approval for modifications")
		})
	})

	describe("getInstructions", () => {
		it("should return formatted instructions about protected files", () => {
			const instructions = controller.getInstructions()

			expect(instructions).toContain("# Protected Files")
			expect(instructions).toContain("write-protected")
			expect(instructions).toContain(".mirrorignore")
			expect(instructions).toContain(".mirror/**")
			expect(instructions).toContain("\u{1F6E1}") // Shield symbol
		})
	})

	describe("getProtectedPatterns", () => {
		it("should return the list of protected patterns", () => {
			const patterns = MirrorProtectedController.getProtectedPatterns()

			expect(patterns).toEqual([
				".mirrorignore",
				".mirrormodes",
				".mirrorrules*",
				".mirrorrules*",
				".mirror/**",
				".vscode/**",
				"*.code-workspace",
				".mirrorprotected",
				"AGENTS.md",
				"AGENT.md",
			])
		})
	})
})
