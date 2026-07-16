/**
 * Tests for PipelineRegistry — discovery, caching, precedence,
 * auto-selection with user defaults, import/delete lifecycle.
 */
import * as path from "path"
import * as fs from "fs"

// Use vi.hoisted so mocks are available during module hoisting
const { mockReadFile, mockReaddir, mockMkdir, mockWriteFile, mockUnlink, mockAccess, mockExistsSync } = vi.hoisted(
	() => ({
		mockReadFile: vi.fn(),
		mockReaddir: vi.fn(),
		mockMkdir: vi.fn(),
		mockWriteFile: vi.fn(),
		mockUnlink: vi.fn(),
		mockAccess: vi.fn(),
		mockExistsSync: vi.fn(),
	}),
)

// ---- Mock filesystem ----
vi.mock("fs/promises", () => ({
	default: {
		readFile: mockReadFile,
		readdir: mockReaddir,
		mkdir: mockMkdir,
		writeFile: mockWriteFile,
		unlink: mockUnlink,
		access: mockAccess,
	},
	readFile: mockReadFile,
	readdir: mockReaddir,
	mkdir: mockMkdir,
	writeFile: mockWriteFile,
	unlink: mockUnlink,
	access: mockAccess,
}))

// ---- Mock logger ----
vi.mock("../../../utils/logging", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}))

// ---- Mock mirror-config ----
vi.mock("../../../services/mirror-config", () => ({
	getGlobalMirrorDirectory: () => path.join("/home/user", ".mirror"),
}))

// ---- Mock fs existsSync ----
vi.mock("fs", async () => {
	const actual = await vi.importActual<typeof import("fs")>("fs")
	return {
		...actual,
		existsSync: mockExistsSync,
	}
})

import { PipelineRegistry } from "../pipeline-registry"
import type { PipelineDefinition, PipelineType } from "../pipeline"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_CWD = "/test/project"
const GLOBAL_PIPELINES_DIR = path.join("/home/user", ".mirror", "pipelines")
const PROJECT_PIPELINES_DIR = path.join(DEFAULT_CWD, ".mirror", "pipelines")

/** A minimal SDXL Turbo workflow in legacy array format. */
const flashWorkflow = {
	_pipeline: {
		name: "SDXL Turbo Flash",
		description: "Fast SDXL Turbo for logos & icons",
		type: "generate" as PipelineType,
		tags: ["fast", "turbo", "logo"],
	},
	nodes: [
		{ id: 1, class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl_turbo.safetensors" } },
		{ id: 2, class_type: "CLIPTextEncode", inputs: { text: "positive", clip: ["1", 1] } },
		{ id: 3, class_type: "CLIPTextEncode", inputs: { text: "negative", clip: ["1", 1] } },
		{ id: 4, class_type: "EmptyLatentImage", inputs: { width: 512, height: 512, batch_size: 1 } },
		{ id: 5, class_type: "SamplerCustom", inputs: {} },
		{ id: 6, class_type: "VAEDecode", inputs: {} },
		{ id: 7, class_type: "SaveImage", inputs: {} },
	],
	links: [],
}

/** A quality txt2img workflow in object format. */
const qualityWorkflow = {
	_pipeline: {
		name: "Quality SDXL",
		description: "High quality generation",
		type: "generate" as PipelineType,
		tags: ["quality", "sdxl"],
	},
	"1": {
		class_type: "CheckpointLoaderSimple",
		inputs: { ckpt_name: "sd_xl_base.safetensors" },
		_meta: { title: "Load Checkpoint" },
	},
	"2": {
		class_type: "CLIPTextEncode",
		inputs: { text: "positive", clip: ["1", 1] },
		_meta: { title: "Positive Prompt" },
	},
}

/** A minimal upscale workflow. */
const upscaleWorkflow = {
	_pipeline: {
		name: "4x Upscaler",
		description: "Upscale images 4x",
		type: "upscale" as PipelineType,
		tags: ["upscale", "4x"],
	},
	"1": { class_type: "LoadImage", inputs: { image: "input.png" }, _meta: { title: "Load Image" } },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PipelineRegistry", () => {
	beforeEach(() => {
		PipelineRegistry.reset()
		vi.clearAllMocks()
	})

	describe("initialize", () => {
		it("skips built-in pipelines from the workflows directory", async () => {
			mockExistsSync.mockReturnValue(true) // resolveWorkflowsDir

			mockReaddir.mockImplementation(async (dir: string) => {
				if (dir.includes("workflows")) {
					return ["pipeline-meta.json", "txt2img.json", "txt2img-flash.json", "upscale.json"]
				}
				// global dir — doesn't exist
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			})

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath.endsWith("pipeline-meta.json")) {
					return JSON.stringify({
						txt2img: {
							name: "txt2img",
							description: "Standard",
							type: "generate",
							tags: ["quality"],
							isDefault: true,
						},
						"txt2img-flash": {
							name: "txt2img-flash",
							description: "Fast",
							type: "generate",
							tags: ["fast", "turbo"],
						},
						upscale: { name: "upscale", description: "Upscale", type: "upscale", tags: [] },
					})
				}
				if (filePath.endsWith("txt2img.json")) {
					return JSON.stringify({
						"1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl.safetensors" } },
					})
				}
				if (filePath.endsWith("txt2img-flash.json")) {
					return JSON.stringify({
						nodes: [{ class_type: "SamplerCustom" }],
						links: [],
					})
				}
				return JSON.stringify({ "1": { class_type: "VAEDecode" } })
			})

			await PipelineRegistry.initialize(DEFAULT_CWD)

			expect(PipelineRegistry.isInitialized()).toBe(true)
			// No built-in pipelines are auto-loaded — users import their own
			expect(PipelineRegistry.listAll()).toHaveLength(0)
			expect(PipelineRegistry.exists("txt2img")).toBe(false)
			expect(PipelineRegistry.exists("txt2img-flash")).toBe(false)
			expect(PipelineRegistry.exists("upscale")).toBe(false)
		})

		it("handles missing pipeline-meta.json gracefully when no builtins loaded", async () => {
			mockExistsSync.mockReturnValue(true)

			mockReaddir.mockImplementation(async (dir: string) => {
				if (dir.includes("workflows")) {
					return ["txt2img.json"] // no pipeline-meta.json
				}
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			})

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath.endsWith("txt2img.json")) {
					return JSON.stringify({
						"1": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: "sd_xl.safetensors" } },
					})
				}
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			})

			await PipelineRegistry.initialize(DEFAULT_CWD)
			// No built-in pipelines are auto-loaded
			expect(PipelineRegistry.exists("txt2img")).toBe(false)
		})
	})

	describe("resolve", () => {
		it("returns a pipeline definition by slug", async () => {
			mockExistsSync.mockReturnValue(true)
			mockReaddir.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))
			// Use global pipelines dir for this test
			mockAccess.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))

			// Manually seed the cache
			PipelineRegistry.reset()
			;(PipelineRegistry as any).cache.set("test-pipe", {
				slug: "test-pipe",
				name: "Test",
				description: "",
				type: "generate",
				tags: [],
				source: "global",
				isDefault: false,
				workflow: {},
			})
			;(PipelineRegistry as any).byType.set("generate", ["test-pipe"])
			;(PipelineRegistry as any).initialized = true

			const def = PipelineRegistry.resolve("test-pipe")
			expect(def.slug).toBe("test-pipe")
			expect(def.name).toBe("Test")
		})

		it("throws when the slug is not found", () => {
			;(PipelineRegistry as any).initialized = true
			expect(() => PipelineRegistry.resolve("nope")).toThrow(/not found/)
		})

		it("throws when the type does not match", () => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("gen-only", {
				slug: "gen-only",
				name: "",
				type: "generate",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			expect(() => PipelineRegistry.resolve("gen-only", "upscale")).toThrow(/was expected/)
		})
	})

	describe("autoSelect", () => {
		beforeEach(() => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("quality", {
				slug: "quality",
				name: "Quality",
				type: "generate",
				tags: ["quality"],
				source: "builtin",
				isDefault: true,
				workflow: {},
			})
			;(PipelineRegistry as any).cache.set("flash", {
				slug: "flash",
				name: "Flash",
				type: "generate",
				tags: ["fast", "turbo"],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			;(PipelineRegistry as any).byType.set("generate", ["quality", "flash"])
		})

		it("returns default pipeline when no fast keywords present", () => {
			const result = PipelineRegistry.autoSelect("a beautiful landscape", "generate")
			expect(result.slug).toBe("quality")
		})

		it("returns fast pipeline when 'logo' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("generate a logo for my company", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'fast' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("I need a fast image", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'icon' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("create an icon for the app", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'thumbnail' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("thumbnail for YouTube", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'draft' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("a draft sketch of a logo", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'placeholder' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("placeholder image", "generate")
			expect(result.slug).toBe("flash")
		})

		it("returns fast pipeline when 'quick' keyword is present", () => {
			const result = PipelineRegistry.autoSelect("quick mockup", "generate")
			expect(result.slug).toBe("flash")
		})

		it("honors user-defined default over keyword heuristics", () => {
			PipelineRegistry.setUserDefault("generate", "flash")
			const result = PipelineRegistry.autoSelect("a beautiful landscape", "generate")
			expect(result.slug).toBe("flash")
		})

		it("user default wins even when fast keywords match a different pipeline", () => {
			PipelineRegistry.setUserDefault("generate", "quality")
			const result = PipelineRegistry.autoSelect("generate a fast logo", "generate")
			expect(result.slug).toBe("quality")
		})

		it("falls back to first candidate if no default is set", () => {
			;(PipelineRegistry as any).cache.set("quality", {
				...(PipelineRegistry as any).cache.get("quality"),
				isDefault: false,
			})
			const result = PipelineRegistry.autoSelect("a landscape painting", "generate")
			expect(result).toBeDefined()
		})

		it("throws when no pipelines exist for the type", () => {
			expect(() => PipelineRegistry.autoSelect("anything", "remove-bg")).toThrow(/No pipelines/)
		})
	})

	describe("importPipeline", () => {
		beforeEach(() => {
			;(PipelineRegistry as any).initialized = true
			mockMkdir.mockResolvedValue(undefined)
			mockWriteFile.mockResolvedValue(undefined)
		})

		it("imports a pipeline with _pipeline header", async () => {
			const slug = await PipelineRegistry.importPipeline(JSON.stringify(flashWorkflow), DEFAULT_CWD)
			expect(slug).toBe("sdxl-turbo-flash")
			expect(PipelineRegistry.exists("sdxl-turbo-flash")).toBe(true)
			expect(mockWriteFile).toHaveBeenCalled()
		})

		it("imports to project directory when cwd is provided", async () => {
			await PipelineRegistry.importPipeline(JSON.stringify(flashWorkflow), DEFAULT_CWD)
			const writtenPath = mockWriteFile.mock.calls[0][0] as string
			expect(writtenPath).toContain(PROJECT_PIPELINES_DIR)
		})

		it("imports to global directory when no cwd", async () => {
			await PipelineRegistry.importPipeline(JSON.stringify(flashWorkflow))
			const writtenPath = mockWriteFile.mock.calls[0][0] as string
			expect(writtenPath).toContain(GLOBAL_PIPELINES_DIR)
		})

		it("throws on invalid JSON", async () => {
			await expect(PipelineRegistry.importPipeline("not json", DEFAULT_CWD)).rejects.toThrow("Invalid JSON")
		})

		it("generates slug from name in _pipeline header", async () => {
			const slug = await PipelineRegistry.importPipeline(JSON.stringify(qualityWorkflow), DEFAULT_CWD)
			expect(slug).toBe("quality-sdxl")
		})
	})

	describe("deletePipeline", () => {
		beforeEach(() => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("user-pipe", {
				slug: "user-pipe",
				name: "User",
				type: "generate",
				tags: [],
				source: "global",
				isDefault: false,
				workflow: {},
			})
			;(PipelineRegistry as any).byType.set("generate", ["user-pipe"])
			mockUnlink.mockResolvedValue(undefined)
		})

		it("deletes a user-added pipeline", async () => {
			await PipelineRegistry.deletePipeline("user-pipe")
			expect(PipelineRegistry.exists("user-pipe")).toBe(false)
		})

		it("throws when trying to delete a built-in pipeline", async () => {
			;(PipelineRegistry as any).cache.set("builtin-pipe", {
				slug: "builtin-pipe",
				name: "Builtin",
				type: "generate",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			await expect(PipelineRegistry.deletePipeline("builtin-pipe")).rejects.toThrow(/Cannot delete built-in/)
		})

		it("throws when slug not found", async () => {
			await expect(PipelineRegistry.deletePipeline("nonexistent")).rejects.toThrow(/not found/)
		})
	})

	describe("setUserDefault / getUserDefault", () => {
		beforeEach(() => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("flash", {
				slug: "flash",
				name: "Flash",
				type: "generate",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
		})

		it("stores and retrieves user default", () => {
			PipelineRegistry.setUserDefault("generate", "flash")
			expect(PipelineRegistry.getUserDefault("generate")).toBe("flash")
		})

		it("ignores unknown slugs", () => {
			PipelineRegistry.setUserDefault("generate", "nonexistent")
			expect(PipelineRegistry.getUserDefault("generate")).toBeUndefined()
		})

		it("returns undefined when no default set", () => {
			expect(PipelineRegistry.getUserDefault("generate")).toBeUndefined()
		})
	})

	describe("reset", () => {
		it("clears all state", async () => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("test", {
				slug: "test",
				name: "",
				type: "generate",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			PipelineRegistry.setUserDefault("generate", "test")
			PipelineRegistry.reset()
			expect(PipelineRegistry.isInitialized()).toBe(false)
			expect(PipelineRegistry.listAll()).toHaveLength(0)
			expect(PipelineRegistry.getUserDefault("generate")).toBeUndefined()
		})
	})

	describe("listByType", () => {
		beforeEach(() => {
			;(PipelineRegistry as any).initialized = true
			;(PipelineRegistry as any).cache.set("a", {
				slug: "a",
				name: "",
				type: "generate",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			;(PipelineRegistry as any).cache.set("b", {
				slug: "b",
				name: "",
				type: "upscale",
				tags: [],
				source: "builtin",
				isDefault: false,
				workflow: {},
			})
			;(PipelineRegistry as any).byType.set("generate", ["a"])
			;(PipelineRegistry as any).byType.set("upscale", ["b"])
		})

		it("returns only pipelines of the given type", () => {
			expect(PipelineRegistry.listByType("generate")).toHaveLength(1)
			expect(PipelineRegistry.listByType("upscale")).toHaveLength(1)
			expect(PipelineRegistry.listByType("remove-bg")).toHaveLength(0)
		})
	})

	describe("source precedence", () => {
		it("project overrides global, global overrides builtin", async () => {
			// Allow access to succeed for global/project dirs
			mockAccess.mockResolvedValue(undefined as any)
			mockExistsSync.mockReturnValue(true)

			// Setup built-in
			mockReaddir.mockImplementation(async (dir: string) => {
				if (dir.includes("workflows")) {
					return ["pipeline-meta.json", "mypipe.json"]
				}
				if (dir.includes(GLOBAL_PIPELINES_DIR)) {
					return ["mypipe.json"]
				}
				if (dir.includes(PROJECT_PIPELINES_DIR)) {
					return ["mypipe.json"]
				}
				throw Object.assign(new Error("ENOENT"), { code: "ENOENT" })
			})

			mockReadFile.mockImplementation(async (filePath: string) => {
				if (filePath.endsWith("pipeline-meta.json")) {
					return JSON.stringify({ mypipe: { name: "Builtin", description: "", type: "generate", tags: [] } })
				}
				if (filePath.includes(GLOBAL_PIPELINES_DIR)) {
					return JSON.stringify({
						_pipeline: { name: "Global", type: "generate", tags: [], isDefault: false },
						"1": { class_type: "CheckpointLoaderSimple" },
					})
				}
				if (filePath.includes(PROJECT_PIPELINES_DIR)) {
					return JSON.stringify({
						_pipeline: { name: "Project", type: "generate", tags: [], isDefault: false },
						"1": { class_type: "CheckpointLoaderSimple" },
					})
				}
				return JSON.stringify({ "1": { class_type: "CheckpointLoaderSimple" } })
			})

			await PipelineRegistry.initialize(DEFAULT_CWD)
			const def = PipelineRegistry.resolve("mypipe")
			expect(def.source).toBe("project")
			expect(def.name).toBe("Project")
		})
	})
})
