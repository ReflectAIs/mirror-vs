/**
 * Hardware detection — inspects the current system to recommend optimal
 * model settings (model, resolution, batch size) for local image generation.
 */
import os from "os"
import { execSync } from "child_process"
import { getPlatformOS, type PlatformOS } from "./platform"

export interface HardwareInfo {
	os: PlatformOS
	arch: string
	totalRAMGB: number
	freeRAMGB: number
	cpuCores: number
	gpuVendor: "apple" | "nvidia" | "amd" | "intel" | "unknown"
	gpuMemoryGB?: number
	gpuCores?: number
	hasCUDA: boolean
	hasROCm: boolean
	hasMetal: boolean
}

export class HardwareDetector {
	/**
	 * Return a short human-readable hardware profile string.
	 * Examples: "apple-m2-32gb", "nvidia-rtx3090-24gb", "cpu-only-16gb"
	 */
	static summarize(hw: HardwareInfo): string {
		if (hw.hasCUDA && hw.gpuMemoryGB) {
			const gpuName = hw.gpuVendor !== "unknown" ? hw.gpuVendor : "nvidia"
			return `${gpuName}-${hw.gpuMemoryGB}gb`
		}
		if (hw.hasMetal) {
			return `apple-${hw.totalRAMGB}gb`
		}
		return `cpu-only-${hw.totalRAMGB}gb`
	}

	/**
	 * Check whether the current hardware supports a given pipeline type.
	 * Returns { supported, warning? } with a human-readable explanation when unsupported.
	 */
	static isPipelineSupported(type: string, hw: HardwareInfo): { supported: boolean; warning?: string } {
		if (hw.totalRAMGB < 4) {
			return { supported: false, warning: `System RAM (${hw.totalRAMGB}GB) is below the minimum required (4GB).` }
		}

		switch (type) {
			case "txt2video":
				if (hw.totalRAMGB < 8) {
					return {
						supported: false,
						warning: `Text-to-Video requires at least 8GB system RAM (detected ${hw.totalRAMGB}GB).`,
					}
				}
				if (!hw.hasCUDA && !hw.hasMetal) {
					return {
						supported: false,
						warning:
							"Text-to-Video requires hardware acceleration (CUDA or Metal). No compatible GPU found.",
					}
				}
				if (hw.gpuMemoryGB !== undefined && hw.gpuMemoryGB < 6) {
					return {
						supported: true,
						warning: `Low GPU VRAM (${hw.gpuMemoryGB}GB). Video generation may run out of memory. 6GB+ recommended.`,
					}
				}
				return { supported: true }

			case "txt2audio":
				if (hw.totalRAMGB < 6) {
					return {
						supported: true,
						warning: `Audio generation works but performs best with 6GB+ RAM (detected ${hw.totalRAMGB}GB).`,
					}
				}
				return { supported: true }

			case "img2img":
			case "inpaint":
			case "outpaint":
				if (hw.totalRAMGB < 4) {
					return {
						supported: false,
						warning: `${type} requires at least 4GB system RAM (detected ${hw.totalRAMGB}GB).`,
					}
				}
				return { supported: true }

			case "txt2img":
			case "upscale":
			case "remove-bg":
			default:
				return { supported: true }
		}
	}

	/**
	 * Gather all available hardware information.
	 */
	/**
	 * Gather all available hardware information.
	 */
	static async detect(): Promise<HardwareInfo> {
		const platform = getPlatformOS()
		const totalRAMGB = Math.round(os.totalmem() / 1024 ** 3)
		const freeRAMGB = Math.round(os.freemem() / 1024 ** 3)

		let gpuVendor: HardwareInfo["gpuVendor"] = "unknown"
		let gpuMemoryGB: number | undefined
		let hasCUDA = false
		let hasROCm = false
		let hasMetal = false

		if (platform === "macos") {
			hasMetal = true
			gpuVendor = "apple"
			// On Apple Silicon, unified memory
			gpuMemoryGB = totalRAMGB
		} else if (platform === "windows" || platform === "linux") {
			// Try to detect NVIDIA GPU via nvidia-smi
			try {
				const output = execSync("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader", {
					encoding: "utf8",
					timeout: 5000,
				})
				if (output.trim()) {
					hasCUDA = true
					gpuVendor = "nvidia"
					const parts = output.trim().split(",")
					if (parts.length >= 2) {
						const memStr = parts[1].trim().replace(" MiB", "")
						gpuMemoryGB = Math.round(parseInt(memStr, 10) / 1024)
					}
				}
			} catch {
				// nvidia-smi not available
			}

			// Try to detect AMD GPU (ROCm)
			try {
				const rocmInfo = execSync("rocm-smi --showproductname", { encoding: "utf8", timeout: 5000 })
				if (rocmInfo.trim()) {
					hasROCm = true
					if (gpuVendor === "unknown") {
						gpuVendor = "amd"
					}
				}
			} catch {
				// rocm-smi not available
			}

			// Fallback: try to detect Intel GPU
			if (gpuVendor === "unknown") {
				try {
					execSync("wmic path Win32_VideoController get name", { encoding: "utf8", timeout: 5000 })
					gpuVendor = "intel"
				} catch {
					// No GPU detection method succeeded
				}
			}
		}

		return {
			os: platform,
			arch: os.arch(),
			totalRAMGB,
			freeRAMGB,
			cpuCores: os.cpus().length,
			gpuVendor,
			gpuMemoryGB,
			hasCUDA,
			hasROCm,
			hasMetal,
		}
	}

	/**
	 * Recommend a default model based on hardware capabilities.
	 */
	static async recommendModel(hardware?: HardwareInfo): Promise<{
		model: string
		maxResolution: number
	}> {
		const hw = hardware || (await HardwareDetector.detect())

		// Apple Silicon — 8GB+ can run FLUX Schnell
		if (hw.os === "macos" && hw.hasMetal) {
			if (hw.totalRAMGB >= 32) {
				return { model: "flux.1-schnell", maxResolution: 1024 }
			} else if (hw.totalRAMGB >= 16) {
				return { model: "sd_xl_turbo", maxResolution: 768 }
			}
			return { model: "sd_1.5", maxResolution: 512 }
		}

		// NVIDIA GPU with CUDA
		if (hw.hasCUDA && hw.gpuMemoryGB) {
			if (hw.gpuMemoryGB >= 16) {
				return { model: "flux.1-schnell", maxResolution: 1024 }
			} else if (hw.gpuMemoryGB >= 8) {
				return { model: "sd_xl_turbo", maxResolution: 768 }
			}
			return { model: "sd_1.5", maxResolution: 512 }
		}

		// CPU-only fallback
		if (hw.totalRAMGB >= 32) {
			return { model: "sd_1.5", maxResolution: 512 }
		}

		return { model: "tiny-sd", maxResolution: 384 }
	}

	/**
	 * Verify if the current hardware supports the selected model.
	 */
	static async verifyHardwareSupport(
		modelId: string,
		hardware?: HardwareInfo,
	): Promise<{
		supported: boolean
		warning?: string
	}> {
		const hw = hardware || (await HardwareDetector.detect())
		const { modelRegistry } = await import("./model-registry")
		const modelMeta = modelRegistry.getModel(modelId)
		if (!modelMeta) {
			return { supported: true }
		}

		const systemRAM = hw.totalRAMGB
		const requiredRAM = modelMeta.minRAM

		// RAM check
		if (systemRAM < requiredRAM) {
			return {
				supported: false,
				warning: `System RAM (${systemRAM}GB) is below the minimum required (${requiredRAM}GB) for ${modelMeta.displayName}.`,
			}
		}

		// VRAM check for NVIDIA or Apple Silicon
		const minVRAM = modelMeta.minVRAM
		if (minVRAM) {
			if (hw.os === "macos" && hw.hasMetal) {
				// Unified memory on macOS
				if (systemRAM < minVRAM) {
					return {
						supported: false,
						warning: `System Unified Memory (${systemRAM}GB) is below the recommended VRAM/RAM (${minVRAM}GB) for ${modelMeta.displayName}.`,
					}
				}
			} else if (hw.hasCUDA && hw.gpuMemoryGB !== undefined) {
				if (hw.gpuMemoryGB < minVRAM) {
					return {
						supported: false,
						warning: `GPU VRAM (${hw.gpuMemoryGB}GB) is below the minimum recommended VRAM (${minVRAM}GB) for ${modelMeta.displayName}.`,
					}
				}
			} else if (!hw.hasCUDA && !hw.hasMetal) {
				// CPU-only
				return {
					supported: false,
					warning: `No compatible GPU acceleration (CUDA or Metal) found. Running ${modelMeta.displayName} on CPU only will be extremely slow.`,
				}
			}
		}

		return { supported: true }
	}

	/**
	 * Recommend optimal ComfyUI command line flags based on hardware.
	 */
	static async getRecommendedFlags(hardware?: HardwareInfo): Promise<string[]> {
		const hw = hardware || (await HardwareDetector.detect())
		const flags: string[] = []

		if (hw.os === "macos" && hw.hasMetal) {
			// macOS metal / Apple Silicon
			flags.push("--force-fp16")
			if (hw.totalRAMGB < 16) {
				flags.push("--lowvram")
			}
		} else if (hw.hasCUDA && hw.gpuMemoryGB !== undefined) {
			// Nvidia GPU with CUDA
			if (hw.gpuMemoryGB < 4) {
				flags.push("--lowvram")
			} else if (hw.gpuMemoryGB >= 16) {
				flags.push("--highvram")
			}
		} else if (hw.hasROCm) {
			// AMD GPU with ROCm
			if (hw.gpuMemoryGB !== undefined && hw.gpuMemoryGB < 8) {
				flags.push("--lowvram")
			}
		} else {
			// CPUfallback
			flags.push("--cpu")
		}

		return flags
	}
}
