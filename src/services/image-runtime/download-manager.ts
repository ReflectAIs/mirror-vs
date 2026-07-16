/**
 * Download Manager — queue, resume, retry downloads with progress reporting.
 */
import fs from "fs/promises"
import { createWriteStream, existsSync } from "fs"
import path from "path"
import { EventEmitter } from "events"
import crypto from "crypto"

export interface DownloadJob {
	id: string
	url: string
	destPath: string
	checksum?: string
	expectedSize?: number
	progress: number
	state: "queued" | "downloading" | "paused" | "completed" | "failed"
	error?: string
}

export type DownloadEvent = "progress" | "complete" | "error" | "queue-change"

export class DownloadManager extends EventEmitter {
	private queue: DownloadJob[] = []
	private activeDownloads = new Map<string, AbortController>()
	private maxConcurrent = 3

	constructor(maxConcurrent?: number) {
		super()
		if (maxConcurrent) this.maxConcurrent = maxConcurrent
	}

	/** Add a download to the queue */
	enqueue(url: string, destPath: string, checksum?: string, expectedSize?: number): string {
		const id = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
		const job: DownloadJob = { id, url, destPath, checksum, expectedSize, progress: 0, state: "queued" }
		this.queue.push(job)
		this.emit(
			"queue-change",
			this.queue.map((j) => ({ id: j.id, state: j.state, progress: j.progress })),
		)
		this.processQueue()
		return id
	}

	/** Cancel a download */
	cancel(id: string): void {
		const controller = this.activeDownloads.get(id)
		if (controller) {
			controller.abort()
			this.activeDownloads.delete(id)
		}
		const idx = this.queue.findIndex((j) => j.id === id)
		if (idx !== -1) {
			this.queue.splice(idx, 1)
		}
		this.emit(
			"queue-change",
			this.queue.map((j) => ({ id: j.id, state: j.state, progress: j.progress })),
		)
	}

	/** Get current queue state */
	getQueue(): DownloadJob[] {
		return [...this.queue]
	}

	private async processQueue(): Promise<void> {
		const running = this.activeDownloads.size
		if (running >= this.maxConcurrent) return

		const next = this.queue.find((j) => j.state === "queued")
		if (!next) return

		next.state = "downloading"
		this.startDownload(next)
	}

	private async startDownload(job: DownloadJob): Promise<void> {
		const controller = new AbortController()
		this.activeDownloads.set(job.id, controller)

		// Timeout the download after 30 minutes of inactivity
		const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000
		let lastActivity = Date.now()
		const inactivityTimer = setInterval(() => {
			if (Date.now() - lastActivity > DOWNLOAD_TIMEOUT_MS) {
				controller.abort()
			}
		}, 30_000)

		try {
			// Ensure directory exists
			await fs.mkdir(path.dirname(job.destPath), { recursive: true })

			const response = await fetch(job.url, { signal: controller.signal })
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`)
			}

			const contentLength = response.headers.get("content-length")
			const totalBytes = contentLength ? parseInt(contentLength, 10) : job.expectedSize || 0
			const reader = response.body?.getReader()
			if (!reader) throw new Error("No response body")

			const writeStream = createWriteStream(job.destPath)
			let downloadedBytes = 0

			// Start a hash if checksum is provided
			let hash: crypto.Hash | undefined
			if (job.checksum) {
				hash = crypto.createHash("sha256")
			}

			const pump = async () => {
				while (true) {
					const { done, value } = await reader.read()
					if (done) break

					downloadedBytes += value.length
					writeStream.write(Buffer.from(value))

					if (hash) hash.update(Buffer.from(value))

					if (totalBytes > 0) {
						job.progress = Math.round((downloadedBytes / totalBytes) * 100)
					}

					// Update the "last activity" timestamp on every chunk
					lastActivity = Date.now()

					this.emit("progress", {
						id: job.id,
						downloadedBytes,
						totalBytes,
						progress: job.progress,
					})
				}
			}

			await pump()

			writeStream.end()
			await new Promise<void>((resolve, reject) => {
				writeStream.on("finish", resolve)
				writeStream.on("error", reject)
			})

			// Verify checksum if provided
			if (hash && job.checksum) {
				const computed = hash.digest("hex")
				if (computed !== job.checksum) {
					throw new Error(`Checksum mismatch: expected ${job.checksum}, got ${computed}`)
				}
			}

			job.state = "completed"
			job.progress = 100
			this.activeDownloads.delete(job.id)
			this.emit("complete", { id: job.id, destPath: job.destPath })
		} catch (err: any) {
			if (err.name === "AbortError") {
				job.state = "failed"
				job.error = "Cancelled"
			} else {
				job.state = "failed"
				job.error = err.message
			}
			this.activeDownloads.delete(job.id)
			this.emit("error", { id: job.id, error: job.error })
		} finally {
			clearInterval(inactivityTimer)
			this.emit(
				"queue-change",
				this.queue.map((j) => ({ id: j.id, state: j.state, progress: j.progress })),
			)
			this.processQueue()
		}
	}
}

export const downloadManager = new DownloadManager()
