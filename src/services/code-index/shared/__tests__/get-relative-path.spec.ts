import path from "path"

import { generateNormalizedAbsolutePath, generateRelativeFilePath } from "../get-relative-path"

describe("get-relative-path", () => {
	describe("generateNormalizedAbsolutePath", () => {
		it("should use provided workspace root", () => {
			const filePath = "src/file.ts"
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const result = generateNormalizedAbsolutePath(filePath, workspaceMirrort)
			// On Windows, path.resolve adds the drive letter, so we need to use path.resolve for the expected value
			expect(result).toBe(path.resolve(workspaceMirrort, filePath))
		})

		it("should handle absolute paths", () => {
			const filePath = path.join(path.sep, "absolute", "path", "file.ts")
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const result = generateNormalizedAbsolutePath(filePath, workspaceMirrort)
			// When an absolute path is provided, it should be resolved to include drive letter on Windows
			expect(result).toBe(path.resolve(filePath))
		})

		it("should normalize paths with . and .. segments", () => {
			const filePath = "./src/../src/file.ts"
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const result = generateNormalizedAbsolutePath(filePath, workspaceMirrort)
			// Use path.resolve to get the expected normalized absolute path
			expect(result).toBe(path.resolve(workspaceMirrort, "src", "file.ts"))
		})
	})

	describe("generateRelativeFilePath", () => {
		it("should use provided workspace root", () => {
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const absolutePath = path.join(workspaceMirrort, "src", "file.ts")
			const result = generateRelativeFilePath(absolutePath, workspaceMirrort)
			expect(result).toBe(path.join("src", "file.ts"))
		})

		it("should handle paths outside workspace", () => {
			const absolutePath = path.join(path.sep, "outside", "workspace", "file.ts")
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const result = generateRelativeFilePath(absolutePath, workspaceMirrort)
			// The result will have .. segments to navigate outside
			expect(result).toContain("..")
		})

		it("should handle same path as workspace", () => {
			const workspaceMirrort = path.join(path.sep, "custom", "workspace")
			const absolutePath = workspaceMirrort
			const result = generateRelativeFilePath(absolutePath, workspaceMirrort)
			expect(result).toBe(".")
		})

		it("should handle multi-workspace scenarios", () => {
			// Simulate the error scenario from the issue
			const workspaceMirrort = path.join(path.sep, "Users", "test", "project")
			const absolutePath = path.join(path.sep, "Users", "test", "admin", ".prettierrc.json")
			const result = generateRelativeFilePath(absolutePath, workspaceMirrort)
			// Should generate a valid relative path, not throw an error
			expect(result).toBe(path.join("..", "admin", ".prettierrc.json"))
		})
	})
})
