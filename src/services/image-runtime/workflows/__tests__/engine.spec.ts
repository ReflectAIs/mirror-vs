import { describe, it, expect, beforeEach, afterEach } from "vitest"
import path from "path"
import fs from "fs"
import { WorkflowEngine } from "../engine"

/**
 * Minimal valid txt2img workflow for testing.
 * Mirrors the structure of first_flow.json with _meta.title fields.
 */
const TEST_WORKFLOW = {
	"1": {
		inputs: { ckpt_name: "sd_xl_turbo.safetensors" },
		class_type: "CheckpointLoaderSimple",
		_meta: { title: "Load Checkpoint" },
	},
	"2": {
		inputs: { text: "default prompt", clip: ["1", 1] },
		class_type: "CLIPTextEncode",
		_meta: { title: "Positive Prompt" },
	},
	"3": {
		inputs: { text: "default negative", clip: ["1", 1] },
		class_type: "CLIPTextEncode",
		_meta: { title: "Negative Prompt" },
	},
	"5": {
		inputs: { width: 1024, height: 1024, batch_size: 1 },
		class_type: "EmptyLatentImage",
		_meta: { title: "Empty Latent Image" },
	},
	"6": {
		inputs: {
			seed: 137215803061229,
			steps: 4,
			cfg: 1,
			sampler_name: "euler_ancestral",
			scheduler: "sgm_uniform",
			denoise: 1,
			model: ["1", 0],
			positive: ["2", 0],
			negative: ["3", 0],
			latent_image: ["5", 0],
		},
		class_type: "KSampler",
		_meta: { title: "KSampler" },
	},
	"7": {
		inputs: { samples: ["6", 0], vae: ["1", 2] },
		class_type: "VAEDecode",
		_meta: { title: "VAE Decode" },
	},
	"8": {
		inputs: { filename_prefix: "ComfyUI", images: ["7", 0] },
		class_type: "SaveImage",
		_meta: { title: "Save Image" },
	},
}

/**
 * Workflow without _meta.title fields (old-style) for testing fallback.
 */
const LEGACY_WORKFLOW = {
	"10": {
		inputs: { image: "input.png" },
		class_type: "LoadImage",
	},
	"20": {
		inputs: { image: "mask.png" },
		class_type: "LoadImage",
	},
}

/**
 * Minimal legacy txt2img workflow without _meta.title fields.
 */
const LEGACY_TXT2IMG = {
	"1": {
		inputs: { ckpt_name: "sd_xl_turbo.safetensors" },
		class_type: "CheckpointLoaderSimple",
	},
	"2": {
		inputs: { text: "default prompt", clip: ["1", 1] },
		class_type: "CLIPTextEncode",
	},
	"3": {
		inputs: { text: "default negative", clip: ["1", 1] },
		class_type: "CLIPTextEncode",
	},
	"5": {
		inputs: { width: 1024, height: 1024, batch_size: 1 },
		class_type: "EmptyLatentImage",
	},
	"6": {
		inputs: {
			seed: 137215803061229,
			steps: 4,
			cfg: 1,
			sampler_name: "euler_ancestral",
			scheduler: "sgm_uniform",
			denoise: 1,
			model: ["1", 0],
			positive: ["2", 0],
			negative: ["3", 0],
			latent_image: ["5", 0],
		},
		class_type: "KSampler",
	},
	"7": {
		inputs: { samples: ["6", 0], vae: ["1", 2] },
		class_type: "VAEDecode",
	},
	"8": {
		inputs: { filename_prefix: "ComfyUI", images: ["7", 0] },
		class_type: "SaveImage",
	},
}

describe("WorkflowEngine", () => {
	describe("loadWorkflowSync", () => {
		it("should load a valid workflow JSON file", () => {
			const workflow = WorkflowEngine.loadWorkflowSync("txt2img")
			expect(workflow).toBeDefined()
			expect(typeof workflow).toBe("object")
			// The txt2img.json should have nodes with _meta.title fields
			const checkpoint = WorkflowEngine.findNodeByTitle(workflow, "Load Checkpoint")
			expect(checkpoint).toBeDefined()
			expect(checkpoint.class_type).toBe("CheckpointLoaderSimple")
		})

		it("should throw for a non-existent workflow type", () => {
			expect(() => WorkflowEngine.loadWorkflowSync("nonexistent" as any)).toThrow()
		})
	})

	describe("findNodeByTitle", () => {
		it("should find a node by its _meta.title", () => {
			const node = WorkflowEngine.findNodeByTitle(TEST_WORKFLOW, "KSampler")
			expect(node).toBeDefined()
			expect(node.class_type).toBe("KSampler")
			expect(node.inputs.seed).toBe(137215803061229)
		})

		it("should return undefined for a missing title", () => {
			const node = WorkflowEngine.findNodeByTitle(TEST_WORKFLOW, "NonExistent")
			expect(node).toBeUndefined()
		})

		it("should return undefined when workflow has nodes without _meta", () => {
			const node = WorkflowEngine.findNodeByTitle(LEGACY_WORKFLOW, "LoadImage")
			expect(node).toBeUndefined()
		})
	})

	describe("findNodeByClassType", () => {
		it("should find a node by its class_type", () => {
			const node = WorkflowEngine.findNodeByClassType(TEST_WORKFLOW, "VAEDecode")
			expect(node).toBeDefined()
			expect(node.class_type).toBe("VAEDecode")
		})

		it("should return undefined for a missing class_type", () => {
			const node = WorkflowEngine.findNodeByClassType(TEST_WORKFLOW, "NonExistent")
			expect(node).toBeUndefined()
		})
	})

	describe("injectPrompt", () => {
		it("should set the text on the Positive Prompt node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectPrompt(workflow, "a beautiful landscape")
			const node = WorkflowEngine.findNodeByTitle(workflow, "Positive Prompt")
			expect(node.inputs.text).toBe("a beautiful landscape")
		})
	})

	describe("injectNegativePrompt", () => {
		it("should append the default negative prompt when user provides one", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectNegativePrompt(workflow, "ugly, distorted")
			const node = WorkflowEngine.findNodeByTitle(workflow, "Negative Prompt")
			expect(node.inputs.text).toContain("ugly, distorted")
			expect(node.inputs.text).toContain("blurry, low quality")
		})

		it("should use only the default negative prompt when user prompt is empty", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectNegativePrompt(workflow, "")
			const node = WorkflowEngine.findNodeByTitle(workflow, "Negative Prompt")
			expect(node.inputs.text).toBe(
				"blurry, low quality, watermark, logo, bad anatomy, deformed, extra fingers, cropped",
			)
		})
	})

	describe("injectModel", () => {
		it("should append .safetensors when the model name has no extension", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectModel(workflow, "sd_xl_turbo")
			const node = WorkflowEngine.findNodeByTitle(workflow, "Load Checkpoint")
			expect(node.inputs.ckpt_name).toBe("sd_xl_turbo.safetensors")
		})

		it("should preserve the model name if it already has an extension", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectModel(workflow, "my_model.ckpt")
			const node = WorkflowEngine.findNodeByTitle(workflow, "Load Checkpoint")
			expect(node.inputs.ckpt_name).toBe("my_model.ckpt")
		})

		it("should fall back to class_type CheckpointLoaderSimple for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectModel(workflow, "sd_xl_turbo")
			expect(workflow["1"].inputs.ckpt_name).toBe("sd_xl_turbo.safetensors")
		})
	})

	describe("injectSeed", () => {
		it("should set the seed on the KSampler node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectSeed(workflow, 42)
			const node = WorkflowEngine.findNodeByTitle(workflow, "KSampler")
			expect(node.inputs.seed).toBe(42)
		})

		it("should fall back to class_type KSampler for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectSeed(workflow, 99)
			expect(workflow["6"].inputs.seed).toBe(99)
		})
	})

	describe("injectDimensions", () => {
		it("should set width and height on the Empty Latent Image node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectDimensions(workflow, 512, 768)
			const node = WorkflowEngine.findNodeByTitle(workflow, "Empty Latent Image")
			expect(node.inputs.width).toBe(512)
			expect(node.inputs.height).toBe(768)
		})

		it("should fall back to class_type EmptyLatentImage for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectDimensions(workflow, 512, 768)
			expect(workflow["5"].inputs.width).toBe(512)
			expect(workflow["5"].inputs.height).toBe(768)
		})
	})

	describe("injectSampler", () => {
		it("should set sampler_name on the KSampler node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectSampler(workflow, "dpmpp_2m")
			const node = WorkflowEngine.findNodeByTitle(workflow, "KSampler")
			expect(node.inputs.sampler_name).toBe("dpmpp_2m")
		})

		it("should fall back to class_type for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectSampler(workflow, "dpmpp_2m")
			expect(workflow["6"].inputs.sampler_name).toBe("dpmpp_2m")
		})
	})

	describe("injectScheduler", () => {
		it("should set scheduler on the KSampler node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectScheduler(workflow, "karras")
			const node = WorkflowEngine.findNodeByTitle(workflow, "KSampler")
			expect(node.inputs.scheduler).toBe("karras")
		})

		it("should fall back to class_type for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectScheduler(workflow, "karras")
			expect(workflow["6"].inputs.scheduler).toBe("karras")
		})
	})

	describe("injectCFG", () => {
		it("should set cfg on the KSampler node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectCFG(workflow, 7.5)
			const node = WorkflowEngine.findNodeByTitle(workflow, "KSampler")
			expect(node.inputs.cfg).toBe(7.5)
		})

		it("should fall back to class_type for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectCFG(workflow, 7.5)
			expect(workflow["6"].inputs.cfg).toBe(7.5)
		})
	})

	describe("injectSteps", () => {
		it("should set steps on the KSampler node by title", () => {
			const workflow = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			WorkflowEngine.injectSteps(workflow, 25)
			const node = WorkflowEngine.findNodeByTitle(workflow, "KSampler")
			expect(node.inputs.steps).toBe(25)
		})

		it("should fall back to class_type for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_TXT2IMG))
			WorkflowEngine.injectSteps(workflow, 25)
			expect(workflow["6"].inputs.steps).toBe(25)
		})
	})

	describe("injectImage", () => {
		it("should set image on the Load Image node by title", () => {
			const workflow = {
				"10": {
					inputs: { image: "" },
					class_type: "LoadImage",
					_meta: { title: "Load Image" },
				},
			}
			WorkflowEngine.injectImage(workflow, "my_input.png")
			expect(workflow["10"].inputs.image).toBe("my_input.png")
		})

		it("should fall back to class_type LoadImage for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_WORKFLOW))
			WorkflowEngine.injectImage(workflow, "my_input.png")
			const node = WorkflowEngine.findNodeByClassType(workflow, "LoadImage")
			expect(node.inputs.image).toBe("my_input.png")
		})
	})

	describe("injectMask", () => {
		it("should set image on the Load Mask node by title", () => {
			const workflow = {
				"10": {
					inputs: { image: "" },
					class_type: "LoadImage",
					_meta: { title: "Load Image" },
				},
				"11": {
					inputs: { image: "" },
					class_type: "LoadImage",
					_meta: { title: "Load Mask" },
				},
			}
			WorkflowEngine.injectMask(workflow, "my_mask.png")
			expect(workflow["11"].inputs.image).toBe("my_mask.png")
		})

		it("should fall back to second LoadImage by class_type for legacy workflows", () => {
			const workflow = JSON.parse(JSON.stringify(LEGACY_WORKFLOW))
			WorkflowEngine.injectMask(workflow, "my_mask.png")
			// Second LoadImage node should have the mask name
			const nodes = Object.values(workflow).filter((n: any) => n.class_type === "LoadImage") as any[]
			expect(nodes[1].inputs.image).toBe("my_mask.png")
		})
	})

	describe("injectUpscaleFactor", () => {
		it("should set upscale_by on an ImageUpscaleWithModel node by title", () => {
			const upscaleWorkflow = {
				"1": {
					inputs: { upscale_by: 2 },
					class_type: "ImageUpscaleWithModel",
					_meta: { title: "Upscale Image" },
				},
			}
			WorkflowEngine.injectUpscaleFactor(upscaleWorkflow, 4)
			expect(upscaleWorkflow["1"].inputs.upscale_by).toBe(4)
		})

		it("should fall back to class_type for legacy upscale workflows", () => {
			const upscaleWorkflow = {
				"1": {
					inputs: { upscale_by: 2 },
					class_type: "ImageUpscaleWithModel",
				},
			}
			WorkflowEngine.injectUpscaleFactor(upscaleWorkflow, 4)
			expect(upscaleWorkflow["1"].inputs.upscale_by).toBe(4)
		})
	})

	// ----------------------------------------------------------------
	// normalizeWorkflow
	// ----------------------------------------------------------------
	describe("normalizeWorkflow", () => {
		it("should return object-format workflows unchanged", () => {
			const objectFormat = JSON.parse(JSON.stringify(TEST_WORKFLOW))
			const result = WorkflowEngine.normalizeWorkflow(objectFormat)
			expect(result).toEqual(TEST_WORKFLOW)
			// Keys should be string node IDs, not "nodes" array
			expect(result["1"]).toBeDefined()
			expect(result.nodes).toBeUndefined()
		})

		it("should convert legacy array-format workflows to object format", () => {
			const legacy = {
				nodes: [
					{ id: 6, type: "CLIPTextEncode", inputs: [{ name: "text", link: 1 }], widgets_values: ["hello"] },
					{ id: 7, type: "KSampler", inputs: [], widgets_values: [true, 42, "fixed", "fixed"] },
				],
				// Proper links array format: [link_id, from_node, from_slot, to_node, to_slot, type]
				links: [[1, 5, 0, 6, 0, "STRING"]],
			}
			const result = WorkflowEngine.normalizeWorkflow(legacy)
			expect(result.nodes).toBeUndefined()
			expect(result["6"].class_type).toBe("CLIPTextEncode")
			// Link ID 1 resolves to ["5", 0] (source node 5, slot 0)
			expect(result["6"].inputs.text).toEqual(["5", 0])
			// CLIPTextEncode widgets_values are moved to inputs and stripped
			// (widgets_values is a web-UI artifact; /prompt API doesn't accept it)
			expect(result["6"].widgets_values).toBeUndefined()
			expect(result["7"].class_type).toBe("KSampler")
			// KSampler has no known widget input order, so widgets_values is just stripped
			expect(result["7"].widgets_values).toBeUndefined()
		})

		it("should assign Positive Prompt title to a single CLIPTextEncode (legacy format)", () => {
			// Single CLIPTextEncode node → always assigned "Positive Prompt" regardless of
			// properties["Node name for S&R"] value, because CLIPTextEncode titles are
			// position-based to ensure injectPrompt/injectNegativePrompt can find them.
			const legacy = {
				nodes: [
					{
						id: 3,
						type: "CLIPTextEncode",
						inputs: [],
						properties: { "Node name for S&R": "Negative Prompt" },
					},
				],
			}
			const result = WorkflowEngine.normalizeWorkflow(legacy)
			expect(result["3"]._meta.title).toBe("Positive Prompt")
		})

		it("should assign standard titles to legacy CLIPTextEncode nodes (1st positive, 2nd negative)", () => {
			// This mirrors the exact structure of txt2img-flash.json where both CLIPTextEncode
			// nodes lack distinct title fields — the fix ensures negative prompt injection
			// targets the correct node instead of overwriting the positive prompt.
			const legacy = {
				nodes: [
					{
						id: 6,
						type: "CLIPTextEncode",
						inputs: [{ name: "clip", link: 38 }],
						widgets_values: [""],
						properties: { "Node name for S&R": "CLIPTextEncode" },
					},
					{
						id: 7,
						type: "CLIPTextEncode",
						title: "CLIP Text Encode (Negative Prompt)",
						inputs: [{ name: "clip", link: 39 }],
						widgets_values: [""],
						properties: { "Node name for S&R": "CLIPTextEncode" },
					},
				],
			}
			const result = WorkflowEngine.normalizeWorkflow(legacy)
			// 1st CLIPTextEncode → Positive Prompt
			expect(result["6"]._meta.title).toBe("Positive Prompt")
			// 2nd CLIPTextEncode → Negative Prompt
			expect(result["7"]._meta.title).toBe("Negative Prompt")
		})

		it("should preserve title from legacy node title field", () => {
			const legacy = {
				nodes: [
					{
						id: 10,
						type: "LoadImage",
						inputs: [],
						title: "Load Image",
					},
				],
			}
			const result = WorkflowEngine.normalizeWorkflow(legacy)
			expect(result["10"]._meta.title).toBe("Load Image")
		})

		it("should throw for null or non-object input", () => {
			expect(() => WorkflowEngine.normalizeWorkflow(null)).toThrow("Invalid workflow")
			expect(() => WorkflowEngine.normalizeWorkflow("string")).toThrow("Invalid workflow")
			expect(() => WorkflowEngine.normalizeWorkflow(undefined)).toThrow("Invalid workflow")
		})
	})

	// ----------------------------------------------------------------
	// Flash / Turbo workflow injectors
	// ----------------------------------------------------------------
	describe("flash/turbo workflow injectors", () => {
		/** Simulates a normalized flash workflow (SamplerCustom + SDTurboScheduler)
		 *  after populateWidgetInputs() has run — widgets_values are mapped to
		 *  inputs and stripped. */
		const FLASH_WORKFLOW = {
			"1": {
				class_type: "CheckpointLoaderSimple",
				inputs: { ckpt_name: "sd_xl_turbo.safetensors" },
				_meta: { title: "Load Checkpoint" },
			},
			"2": {
				class_type: "CLIPTextEncode",
				inputs: { text: "default", clip: ["1", 1] },
				_meta: { title: "Positive Prompt" },
			},
			"3": {
				class_type: "CLIPTextEncode",
				inputs: { text: "bad stuff", clip: ["1", 1] },
				_meta: { title: "Negative Prompt" },
			},
			"4": {
				class_type: "EmptyLatentImage",
				inputs: { width: 512, height: 512, batch_size: 1 },
				_meta: { title: "Empty Latent Image" },
			},
			"5": {
				class_type: "SamplerCustom",
				// After populateWidgetInputs: widgets_values [false, 0, "randomize", "fixed"]
				// mapped to inputs { add_noise, noise_seed, control_after_generate, cfg }
				// cfg (index 3, value 1) is a required FLOAT input for SamplerCustom;
				// control_after_generate (index 2) is UI-only but harmlessly ignored by /prompt API
				inputs: {
					add_noise: false,
					noise_seed: 0,
					cfg: 1,
					sampler: ["6", 0],
					sigmas: ["7", 0],
					latent_image: ["4", 0],
					positive: ["2", 0],
					negative: ["3", 0],
				},
			},
			"6": {
				class_type: "KSamplerSelect",
				inputs: { sampler_name: "euler_ancestral" },
				_meta: { title: "KSamplerSelect" },
			},
			"7": {
				class_type: "SDTurboScheduler",
				inputs: { steps: 4, denoise: 0, model: ["1", 0] },
				_meta: { title: "SDTurboScheduler" },
			},
			"8": {
				class_type: "VAEDecode",
				inputs: { samples: ["5", 0], vae: ["1", 2] },
				_meta: { title: "VAE Decode" },
			},
			"9": {
				class_type: "SaveImage",
				inputs: { filename_prefix: "ComfyUI", images: ["8", 0] },
				_meta: { title: "Save Image" },
			},
		}

		it("injectSeed should set noise_seed on SamplerCustom", () => {
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectSeed(workflow, 12345)
			expect(workflow["5"].inputs.noise_seed).toBe(12345)
		})

		it("injectSteps should set steps on SDTurboScheduler", () => {
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectSteps(workflow, 8)
			expect(workflow["7"].inputs.steps).toBe(8)
		})

		it("injectSampler should set sampler_name on KSamplerSelect when no KSampler", () => {
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectSampler(workflow, "dpmpp_2m")
			expect(workflow["6"].inputs.sampler_name).toBe("dpmpp_2m")
		})

		it("injectPrompt should work on flash workflows (CLIPTextEncode present)", () => {
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectPrompt(workflow, "a fast logo")
			expect(workflow["2"].inputs.text).toBe("a fast logo")
		})

		it("injectNegativePrompt should work on flash workflows", () => {
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectNegativePrompt(workflow, "ugly")
			expect(workflow["3"].inputs.text).toContain("ugly")
		})

		it("injectPrompt should NOT overwrite positive prompt when injectNegativePrompt is called after it", () => {
			// This guards against the bug where injectNegativePrompt finds the wrong
			// CLIPTextEncode node (positive instead of negative) and overwrites it.
			const workflow = JSON.parse(JSON.stringify(FLASH_WORKFLOW))
			WorkflowEngine.injectPrompt(workflow, "a beautiful sunrise over mountains")
			WorkflowEngine.injectNegativePrompt(workflow, "ugly, distorted")
			// Positive prompt should remain intact
			expect(workflow["2"].inputs.text).toBe("a beautiful sunrise over mountains")
			// Negative prompt should contain user text + default
			expect(workflow["3"].inputs.text).toContain("ugly, distorted")
			expect(workflow["3"].inputs.text).toContain("blurry, low quality")
		})
	})

	// ----------------------------------------------------------------
	// convertLegacyToObject — flash pipeline end-to-end
	// ----------------------------------------------------------------
	// ----------------------------------------------------------------
	// Connection-based injection — swapped-title workflows
	// ----------------------------------------------------------------
	describe("connection-based injection with swapped-title workflows", () => {
		/**
		 * Simulates a user-imported workflow where the CLIPTextEncode node
		 * titles DON'T match the actual KSampler wiring.
		 *
		 * This is the exact scenario that caused the "hands" bug:
		 * - Node "2" has _meta.title="Negative Prompt" but feeds KSampler.positive
		 * - Node "3" has _meta.title="Positive Prompt" but feeds KSampler.negative
		 *
		 * The fix (connection-based lookup) must trace from the sampler's
		 * `positive` and `negative` connection inputs to find the right nodes,
		 * ignoring their _meta.title.
		 */
		const SWAPPED_TITLES_WORKFLOW = {
			"1": {
				inputs: { ckpt_name: "sd_xl_turbo.safetensors" },
				class_type: "CheckpointLoaderSimple",
				_meta: { title: "Load Checkpoint" },
			},
			"2": {
				inputs: { text: "I am the negative node", clip: ["1", 1] },
				class_type: "CLIPTextEncode",
				_meta: { title: "Negative Prompt" }, // Wrong! Actually feeds positive
			},
			"3": {
				inputs: { text: "I am the positive node", clip: ["1", 1] },
				class_type: "CLIPTextEncode",
				_meta: { title: "Positive Prompt" }, // Wrong! Actually feeds negative
			},
			"5": {
				inputs: { width: 1024, height: 1024, batch_size: 1 },
				class_type: "EmptyLatentImage",
				_meta: { title: "Empty Latent Image" },
			},
			"6": {
				inputs: {
					seed: 42,
					steps: 4,
					cfg: 1,
					sampler_name: "euler_ancestral",
					scheduler: "sgm_uniform",
					denoise: 1,
					model: ["1", 0],
					positive: ["2", 0], // Connected to node "2" (titled "Negative Prompt")
					negative: ["3", 0], // Connected to node "3" (titled "Positive Prompt")
					latent_image: ["5", 0],
				},
				class_type: "KSampler",
				_meta: { title: "KSampler" },
			},
			"7": {
				inputs: { samples: ["6", 0], vae: ["1", 2] },
				class_type: "VAEDecode",
				_meta: { title: "VAE Decode" },
			},
			"8": {
				inputs: { filename_prefix: "ComfyUI", images: ["7", 0] },
				class_type: "SaveImage",
				_meta: { title: "Save Image" },
			},
		}

		const SWAPPED_TITLES_FLASH = {
			"1": {
				class_type: "CheckpointLoaderSimple",
				inputs: { ckpt_name: "sd_xl_turbo.safetensors" },
				_meta: { title: "Load Checkpoint" },
			},
			"2": {
				class_type: "CLIPTextEncode",
				inputs: { text: "default neg", clip: ["1", 1] },
				_meta: { title: "Negative Prompt" },
			}, // Feeds positive
			"3": {
				class_type: "CLIPTextEncode",
				inputs: { text: "default pos", clip: ["1", 1] },
				_meta: { title: "Positive Prompt" },
			}, // Feeds negative
			"4": {
				class_type: "EmptyLatentImage",
				inputs: { width: 512, height: 512, batch_size: 1 },
				_meta: { title: "Empty Latent Image" },
			},
			"5": {
				class_type: "SamplerCustom",
				inputs: {
					add_noise: false,
					noise_seed: 0,
					cfg: 1,
					sampler: ["6", 0],
					sigmas: ["7", 0],
					latent_image: ["4", 0],
					positive: ["2", 0], // Connected to node "2" (titled "Negative Prompt")
					negative: ["3", 0], // Connected to node "3" (titled "Positive Prompt")
				},
			},
			"6": {
				class_type: "KSamplerSelect",
				inputs: { sampler_name: "euler_ancestral" },
				_meta: { title: "KSamplerSelect" },
			},
			"7": {
				class_type: "SDTurboScheduler",
				inputs: { steps: 4, denoise: 0, model: ["1", 0] },
				_meta: { title: "SDTurboScheduler" },
			},
			"8": {
				class_type: "VAEDecode",
				inputs: { samples: ["5", 0], vae: ["1", 2] },
				_meta: { title: "VAE Decode" },
			},
			"9": {
				class_type: "SaveImage",
				inputs: { filename_prefix: "ComfyUI", images: ["8", 0] },
				_meta: { title: "Save Image" },
			},
		}

		describe("KSampler workflows", () => {
			it("injectPrompt should trace positive connection regardless of node titles", () => {
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_WORKFLOW))
				WorkflowEngine.injectPrompt(workflow, "a beautiful landscape")
				// Node "2" has _meta.title="Negative Prompt" but feeds KSampler.positive
				// Connection-based lookup should find it by tracing the positive input
				expect(workflow["2"].inputs.text).toBe("a beautiful landscape")
				// Node "3" should remain untouched
				expect(workflow["3"].inputs.text).toBe("I am the positive node")
			})

			it("injectNegativePrompt should trace negative connection regardless of node titles", () => {
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_WORKFLOW))
				WorkflowEngine.injectNegativePrompt(workflow, "ugly, distorted")
				// Node "3" has _meta.title="Positive Prompt" but feeds KSampler.negative
				// Connection-based lookup should find it by tracing the negative input
				expect(workflow["3"].inputs.text).toContain("ugly, distorted")
				expect(workflow["3"].inputs.text).toContain("blurry, low quality")
				// Node "2" should remain untouched
				expect(workflow["2"].inputs.text).toBe("I am the negative node")
			})

			it("should NOT overwrite positive prompt when negative prompt is injected after it", () => {
				// This guards against the exact "hands" bug:
				// injectPrompt traces positive connection → node "2"
				// injectNegativePrompt traces negative connection → node "3"
				// They must target DIFFERENT nodes
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_WORKFLOW))
				WorkflowEngine.injectPrompt(workflow, "a beautiful sunrise over mountains")
				WorkflowEngine.injectNegativePrompt(workflow, "deformed, extra fingers")

				// Positive prompt should be in node "2" (feeds KSampler.positive)
				expect(workflow["2"].inputs.text).toBe("a beautiful sunrise over mountains")
				// Negative prompt should be in node "3" (feeds KSampler.negative)
				expect(workflow["3"].inputs.text).toContain("deformed, extra fingers")
				// Verify they are DIFFERENT nodes
				expect(workflow["2"].inputs.text).not.toContain("deformed")
				expect(workflow["3"].inputs.text).not.toContain("sunrise")
			})

			it("injectPrompt still works via title fallback when KSampler has no 'positive' input", () => {
				const minimal = JSON.parse(JSON.stringify(SWAPPED_TITLES_WORKFLOW))
				// Break the positive connection
				delete minimal["6"].inputs.positive
				WorkflowEngine.injectPrompt(minimal, "fallback test")
				// Should fall back to title-based lookup → finds node "3" (titled "Positive Prompt")
				expect(minimal["3"].inputs.text).toBe("fallback test")
			})

			it("injectNegativePrompt still works via title fallback when KSampler has no 'negative' input", () => {
				const minimal = JSON.parse(JSON.stringify(SWAPPED_TITLES_WORKFLOW))
				// Break the negative connection
				delete minimal["6"].inputs.negative
				WorkflowEngine.injectNegativePrompt(minimal, "fallback neg")
				// Should fall back to title-based lookup → finds node "2" (titled "Negative Prompt")
				expect(minimal["2"].inputs.text).toContain("fallback neg")
			})
		})

		describe("SamplerCustom (flash/turbo) workflows", () => {
			it("injectPrompt should trace positive connection on SamplerCustom", () => {
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_FLASH))
				WorkflowEngine.injectPrompt(workflow, "flash landscape")
				// Node "2" has _meta.title="Negative Prompt" but feeds SamplerCustom.positive
				expect(workflow["2"].inputs.text).toBe("flash landscape")
				expect(workflow["3"].inputs.text).toBe("default pos")
			})

			it("injectNegativePrompt should trace negative connection on SamplerCustom", () => {
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_FLASH))
				WorkflowEngine.injectNegativePrompt(workflow, "bad quality")
				// Node "3" has _meta.title="Positive Prompt" but feeds SamplerCustom.negative
				expect(workflow["3"].inputs.text).toContain("bad quality")
				expect(workflow["3"].inputs.text).toContain("blurry, low quality")
				expect(workflow["2"].inputs.text).toBe("default neg")
			})

			it("should NOT overwrite positive prompt on flash workflows with swapped titles", () => {
				const workflow = JSON.parse(JSON.stringify(SWAPPED_TITLES_FLASH))
				WorkflowEngine.injectPrompt(workflow, "fast logo design")
				WorkflowEngine.injectNegativePrompt(workflow, "complex, detailed")

				// Positive in node "2" (connected to SamplerCustom.positive)
				expect(workflow["2"].inputs.text).toBe("fast logo design")
				// Negative in node "3" (connected to SamplerCustom.negative)
				expect(workflow["3"].inputs.text).toContain("complex, detailed")
				// Different nodes — positive should NOT contain negative text
				expect(workflow["2"].inputs.text).not.toContain("complex")
				expect(workflow["2"].inputs.text).not.toContain("detailed")
				// Negative should NOT contain the user's positive prompt
				expect(workflow["3"].inputs.text).not.toContain("fast logo design")
			})
		})
	})

	// ----------------------------------------------------------------
	// convertLegacyToObject — flash pipeline (txt2img-flash.json style)
	// ----------------------------------------------------------------
	describe("convertLegacyToObject — flash pipeline (txt2img-flash.json style)", () => {
		/** Reproduces the legacy array format from txt2img-flash.json. */
		const FLASH_LEGACY = {
			nodes: [
				{
					id: 20,
					type: "CheckpointLoaderSimple",
					inputs: [],
					widgets_values: ["sd_xl_turbo.safetensors"],
					properties: { "Node name for S&R": "CheckpointLoaderSimple" },
				},
				{
					id: 14,
					type: "KSamplerSelect",
					inputs: [],
					widgets_values: ["euler_ancestral"],
					properties: { "Node name for S&R": "KSamplerSelect" },
				},
				{
					id: 5,
					type: "EmptyLatentImage",
					inputs: [],
					widgets_values: [512, 512, 1],
					properties: { "Node name for S&R": "EmptyLatentImage" },
				},
				{
					id: 8,
					type: "VAEDecode",
					inputs: [
						{ name: "samples", link: 28 },
						{ name: "vae", link: 40 },
					],
					widgets_values: [],
					properties: { "Node name for S&R": "VAEDecode" },
				},
				{
					id: 25,
					type: "PreviewImage",
					inputs: [{ name: "images", link: 53 }],
					widgets_values: [],
					properties: { "Node name for S&R": "PreviewImage" },
				},
				{
					id: 22,
					type: "SDTurboScheduler",
					inputs: [{ name: "model", link: 45 }],
					widgets_values: [1, 1],
					properties: { "Node name for S&R": "SDTurboScheduler" },
				},
				{
					id: 27,
					type: "SaveImage",
					inputs: [{ name: "images", link: 54 }],
					widgets_values: ["ComfyUI"],
					properties: {},
				},
				{
					id: 13,
					type: "SamplerCustom",
					inputs: [
						{ name: "model", link: 41 },
						{ name: "positive", link: 19 },
						{ name: "negative", link: 20 },
						{ name: "sampler", link: 18 },
						{ name: "sigmas", link: 49 },
						{ name: "latent_image", link: 23 },
					],
					widgets_values: [true, 0, "fixed", 1],
					properties: { "Node name for S&R": "SamplerCustom" },
				},
				{
					id: 6,
					type: "CLIPTextEncode",
					inputs: [{ name: "clip", link: 38 }],
					widgets_values: [""],
					properties: { "Node name for S&R": "CLIPTextEncode" },
				},
				{
					id: 7,
					type: "CLIPTextEncode",
					title: "CLIP Text Encode (Negative Prompt)",
					inputs: [{ name: "clip", link: 39 }],
					widgets_values: [""],
					properties: { "Node name for S&R": "CLIPTextEncode" },
				},
			],
			links: [
				[18, 14, 0, 13, 3, "SAMPLER"],
				[19, 6, 0, 13, 1, "CONDITIONING"],
				[20, 7, 0, 13, 2, "CONDITIONING"],
				[23, 5, 0, 13, 5, "LATENT"],
				[28, 13, 0, 8, 0, "LATENT"],
				[38, 20, 1, 6, 0, "CLIP"],
				[39, 20, 1, 7, 0, "CLIP"],
				[40, 20, 2, 8, 1, "VAE"],
				[41, 20, 0, 13, 0, "MODEL"],
				[45, 20, 0, 22, 0, "MODEL"],
				[49, 22, 0, 13, 4, "SIGMAS"],
				[53, 8, 0, 25, 0, "IMAGE"],
				[54, 8, 0, 27, 0, "IMAGE"],
			],
		}

		it("should convert to object format with correct CLIPTextEncode titles", () => {
			const result = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			expect(result.nodes).toBeUndefined()
			// CLIPTextEncode nodes should have position-based titles
			expect(result["6"]._meta.title).toBe("Positive Prompt")
			expect(result["7"]._meta.title).toBe("Negative Prompt")
			// Non-CLIPTextEncode nodes preserve their properties-based title
			expect(result["20"]._meta.title).toBe("CheckpointLoaderSimple")
			expect(result["14"]._meta.title).toBe("KSamplerSelect")
			expect(result["13"]._meta.title).toBe("SamplerCustom")
			// SaveImage with empty properties → no _meta.title
			expect(result["27"]._meta?.title).toBeUndefined()
		})

		it("should resolve legacy link IDs to [source_node, source_slot] tuples", () => {
			// This is the critical fix for the flash pipeline: link IDs must be
			// resolved so that ComfyUI's /prompt API can route connections correctly.
			const result = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))

			// SamplerCustom (id=13) — all 6 inputs should resolve to [node_id, slot] tuples
			expect(result["13"].inputs.model).toEqual(["20", 0]) // link 41: node 20, slot 0
			expect(result["13"].inputs.positive).toEqual(["6", 0]) // link 19: node 6, slot 0
			expect(result["13"].inputs.negative).toEqual(["7", 0]) // link 20: node 7, slot 0
			expect(result["13"].inputs.sampler).toEqual(["14", 0]) // link 18: node 14, slot 0
			expect(result["13"].inputs.sigmas).toEqual(["22", 0]) // link 49: node 22, slot 0
			expect(result["13"].inputs.latent_image).toEqual(["5", 0]) // link 23: node 5, slot 0

			// VAEDecode (id=8)
			expect(result["8"].inputs.samples).toEqual(["13", 0]) // link 28: node 13, slot 0
			expect(result["8"].inputs.vae).toEqual(["20", 2]) // link 40: node 20, slot 2

			// CLIPTextEncode nodes — clip input from CheckpointLoaderSimple
			expect(result["6"].inputs.clip).toEqual(["20", 1]) // link 38: node 20, slot 1
			expect(result["7"].inputs.clip).toEqual(["20", 1]) // link 39: node 20, slot 1

			// SDTurboScheduler
			expect(result["22"].inputs.model).toEqual(["20", 0]) // link 45: node 20, slot 0

			// PreviewImage + SaveImage
			expect(result["25"].inputs.images).toEqual(["8", 0]) // link 53: node 8, slot 0
			expect(result["27"].inputs.images).toEqual(["8", 0]) // link 54: node 8, slot 0
		})

		it("should map CLIPTextEncode widgets_values[0] to inputs.text for API compatibility", () => {
			const result = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))

			// CLIPTextEncode (id=6) — widgets_values[0] = "" → inputs.text = ""
			expect(result["6"].inputs.text).toBe("")
			// widgets_values is stripped after mapping (the /prompt API doesn't accept it)
			expect(result["6"].widgets_values).toBeUndefined()

			// CLIPTextEncode (id=7) — widgets_values[0] = "" → inputs.text = ""
			expect(result["7"].inputs.text).toBe("")
			expect(result["7"].widgets_values).toBeUndefined()
		})

		it("should map SaveImage widgets_values[0] to inputs.filename_prefix", () => {
			const result = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			expect(result["27"].inputs.filename_prefix).toBe("ComfyUI")
		})

		it("should allow prompt injection after legacy-to-object conversion", () => {
			const workflow = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))

			// Inject prompt + negative prompt like ComfyUIProvider.generate() does
			WorkflowEngine.injectPrompt(workflow, "a cute cat logo, flat design, minimalist")
			WorkflowEngine.injectNegativePrompt(workflow, "complex, realistic")

			// Positive prompt node (id=6) — injectPrompt sets inputs.text
			expect(workflow["6"].inputs.text).toBe("a cute cat logo, flat design, minimalist")

			// Negative prompt node (id=7) — injectNegativePrompt sets inputs.text
			expect(workflow["7"].inputs.text).toContain("complex, realistic")
			expect(workflow["7"].inputs.text).toContain("blurry, low quality")
		})

		it("should inject seed into SamplerCustom inputs.noise_seed after conversion", () => {
			const workflow = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			WorkflowEngine.injectSeed(workflow, 99999)
			// After populateWidgetInputs(), widgets_values are mapped to inputs and stripped
			// SamplerCustom: widgets_values = [add_noise, noise_seed, control_after_generate, ...]
			// mapped to inputs { add_noise, noise_seed } — control_after_generate is UI-only and stripped
			expect(workflow["13"].inputs.noise_seed).toBe(99999)
			expect(workflow["13"].widgets_values).toBeUndefined()
		})

		it("should map SamplerCustom widgets_values[3] (cfg) to inputs.cfg after conversion", () => {
			// widgets_values = [true, 0, "fixed", 1]
			// Index 0 → inputs.add_noise = true
			// Index 1 → inputs.noise_seed = 0
			// Index 2 → inputs.control_after_generate = "fixed" (UI-only, ignored by /prompt API)
			// Index 3 → inputs.cfg = 1 (required FLOAT input — was MISSING before the fix)
			const result = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			expect(result["13"].inputs.add_noise).toBe(true)
			expect(result["13"].inputs.noise_seed).toBe(0)
			expect(result["13"].inputs.cfg).toBe(1)
			expect(result["13"].widgets_values).toBeUndefined()
		})

		it("should inject steps into SDTurboScheduler inputs.steps after conversion", () => {
			const workflow = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			WorkflowEngine.injectSteps(workflow, 3)
			// SDTurboScheduler: widgets_values = [steps, denoise] → inputs.steps
			expect(workflow["22"].inputs.steps).toBe(3)
			expect(workflow["22"].widgets_values).toBeUndefined()
		})

		it("should inject sampler into KSamplerSelect inputs.sampler_name after conversion", () => {
			const workflow = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			WorkflowEngine.injectSampler(workflow, "dpmpp_2m")
			// KSamplerSelect: widgets_values = [sampler_name] → inputs.sampler_name
			expect(workflow["14"].inputs.sampler_name).toBe("dpmpp_2m")
			expect(workflow["14"].widgets_values).toBeUndefined()
		})

		it("should inject model and dimensions after conversion", () => {
			const workflow = WorkflowEngine.normalizeWorkflow(JSON.parse(JSON.stringify(FLASH_LEGACY)))
			WorkflowEngine.injectModel(workflow, "sd_xl_turbo")
			expect(workflow["20"].inputs.ckpt_name).toBe("sd_xl_turbo.safetensors")

			WorkflowEngine.injectDimensions(workflow, 768, 768)
			expect(workflow["5"].inputs.width).toBe(768)
			expect(workflow["5"].inputs.height).toBe(768)
		})
	})
})
