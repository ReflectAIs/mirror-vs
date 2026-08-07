import { safeWriteJson } from "../../utils/safeWriteJson"
import * as path from "path"
import * as vscode from "vscode"
import { getTaskDirectoryPath } from "../../utils/storage"
import { GlobalFileNames } from "../../shared/globalFileNames"
import { fileExistsAtPath } from "../../utils/fs"
import fs from "fs/promises"
import { ContextProxy } from "../config/ContextProxy"
import type { FileMetadataEntry, RecordSource, TaskMetadata } from "./FileContextTrackerTypes"
import { MirrorProvider } from "../webview/MirrorProvider"

// This class is responsible for tracking file operations that may result in stale context.
// If a user modifies a file outside of Mirror VS, the context may become stale and need to be updated.
// We do not want Mirror VS to reload the context every time a file is modified, so we use this class merely
// to inform Mirror VS that the change has occurred, and tell Mirror VS to reload the file before making
// any changes to it. This fixes an issue with diff editing, where Mirror VS was unable to complete a diff edit.

// FileContextTracker
//
// This class is responsible for tracking file operations.
// If the full contents of a file are passed to Mirror VS via a tool, mention, or edit, the file is marked as active.
// If a file is modified outside of Mirror VS, we detect and track this change to prevent stale context.
export class FileContextTracker {
	readonly taskId: string
	private providerRef: WeakRef<MirrorProvider>

	// File tracking and watching
	private fileWatchers = new Map<string, vscode.FileSystemWatcher>()
	private recentlyModifiedFiles = new Set<string>()
	private recentlyEditedByMirror = new Set<string>()
	private checkpointPossibleFiles = new Set<string>()

	constructor(provider: MirrorProvider, taskId: string) {
		this.providerRef = new WeakRef(provider)
		this.taskId = taskId
	}

	// Gets the current working directory or returns undefined if it cannot be determined
	private getCwd(): string | undefined {
		const cwd = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath).at(0)
		if (!cwd) {
			console.info("No workspace folder available - cannot determine current working directory")
		}
		return cwd
	}

	// File watchers are set up for each file that is tracked in the task metadata.
	async setupFileWatcher(filePath: string) {
		// Only setup watcher if it doesn't already exist for this file
		if (this.fileWatchers.has(filePath)) {
			return
		}

		const cwd = this.getCwd()
		if (!cwd) {
			return
		}

		// Create a file system watcher for this specific file
		const fileUri = vscode.Uri.file(path.resolve(cwd, filePath))
		const watcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(path.dirname(fileUri.fsPath), path.basename(fileUri.fsPath)),
		)

		// Track file changes
		watcher.onDidChange(() => {
			if (this.recentlyEditedByMirror.has(filePath)) {
				this.recentlyEditedByMirror.delete(filePath) // This was an edit by Mirror VS, no need to inform Mirror VS
			} else {
				this.recentlyModifiedFiles.add(filePath) // This was a user edit, we will inform Mirror VS
				this.trackFileContext(filePath, "user_edited") // Update the task metadata with file tracking
			}
		})

		// Store the watcher so we can dispose it later
		this.fileWatchers.set(filePath, watcher)
	}

	// Tracks a file operation in metadata and sets up a watcher for the file
	// This is the main entry point for FileContextTracker and is called when a file is passed to Mirror VS via a tool, mention, or edit.
	async trackFileContext(filePath: string, operation: RecordSource) {
		try {
			const cwd = this.getCwd()
			if (!cwd) {
				return
			}

			await this.addFileToFileContextTracker(this.taskId, filePath, operation)

			// Set up file watcher for this file
			await this.setupFileWatcher(filePath)
		} catch (error) {
			console.error("Failed to track file operation:", error)
		}
	}

	public getContextProxy(): ContextProxy | undefined {
		const provider = this.providerRef.deref()
		if (!provider) {
			console.error("MirrorProvider reference is no longer valid")
			return undefined
		}
		const context = provider.contextProxy

		if (!context) {
			console.error("Context is not available")
			return undefined
		}

		return context
	}

	// Gets task metadata from storage
	async getTaskMetadata(taskId: string): Promise<TaskMetadata> {
		const globalStoragePath = this.getContextProxy()?.globalStorageUri.fsPath ?? ""
		const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
		const filePath = path.join(taskDir, GlobalFileNames.taskMetadata)
		try {
			if (await fileExistsAtPath(filePath)) {
				return JSON.parse(await fs.readFile(filePath, "utf8"))
			}
		} catch (error) {
			console.error("Failed to read task metadata:", error)
		}
		return { files_in_context: [] }
	}

	// Saves task metadata to storage
	async saveTaskMetadata(taskId: string, metadata: TaskMetadata) {
		try {
			const globalStoragePath = this.getContextProxy()!.globalStorageUri.fsPath
			const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
			const filePath = path.join(taskDir, GlobalFileNames.taskMetadata)
			await safeWriteJson(filePath, metadata)
		} catch (error) {
			console.error("Failed to save task metadata:", error)
		}
	}

	// Adds a file to the metadata tracker
	// This handles the business logic of determining if the file is new, stale, or active.
	// It also updates the metadata with the latest read/edit dates.
	async addFileToFileContextTracker(taskId: string, filePath: string, source: RecordSource) {
		try {
			const metadata = await this.getTaskMetadata(taskId)
			const now = Date.now()

			// Mark existing entries for this file as stale
			metadata.files_in_context.forEach((entry) => {
				if (entry.path === filePath && entry.record_state === "active") {
					entry.record_state = "stale"
				}
			})

			// Helper to get the latest date for a specific field and file
			const getLatestDateForField = (path: string, field: keyof FileMetadataEntry): number | null => {
				const relevantEntries = metadata.files_in_context
					.filter((entry) => entry.path === path && entry[field])
					.sort((a, b) => (b[field] as number) - (a[field] as number))

				return relevantEntries.length > 0 ? (relevantEntries[0][field] as number) : null
			}

			let newEntry: FileMetadataEntry = {
				path: filePath,
				record_state: "active",
				record_source: source,
				mirror_read_date: getLatestDateForField(filePath, "mirror_read_date"),
				mirror_edit_date: getLatestDateForField(filePath, "mirror_edit_date"),
				user_edit_date: getLatestDateForField(filePath, "user_edit_date"),
			}

			switch (source) {
				// user_edited: The user has edited the file
				case "user_edited":
					newEntry.user_edit_date = now
					this.recentlyModifiedFiles.add(filePath)
					break

				// mirror_edited: Mirror VS has edited the file
				case "mirror_edited":
					newEntry.mirror_read_date = now
					newEntry.mirror_edit_date = now
					this.checkpointPossibleFiles.add(filePath)
					this.markFileAsEditedByMirror(filePath)
					break

				// read_tool/file_mentioned: Mirror VS has read the file via a tool or file mention
				case "read_tool":
				case "file_mentioned":
					newEntry.mirror_read_date = now
					break
			}

			metadata.files_in_context.push(newEntry)
			await this.saveTaskMetadata(taskId, metadata)
		} catch (error) {
			console.error("Failed to add file to metadata:", error)
		}
	}

	// Returns (and then clears) the set of recently modified files
	getAndClearRecentlyModifiedFiles(): string[] {
		const files = Array.from(this.recentlyModifiedFiles)
		this.recentlyModifiedFiles.clear()
		return files
	}

	/**
	 * Gets a list of unique file paths that Mirror VS has read during this task.
	 * Files are sorted by most recently read first, so if there's a character
	 * budget during folded context generation, the most relevant (recent) files
	 * are prioritized.
	 *
	 * @param sinceTimestamp - Optional timestamp to filter files read after this time
	 * @returns Array of unique file paths that have been read, most recent first
	 */
	async getFilesReadByMirror(sinceTimestamp?: number): Promise<string[]> {
		try {
			const metadata = await this.getTaskMetadata(this.taskId)

			const readEntries = metadata.files_in_context.filter((entry) => {
				// Only include files that were read by Mirror VS (not user edits)
				const isReadByMirror = entry.record_source === "read_tool" || entry.record_source === "file_mentioned"
				if (!isReadByMirror) {
					return false
				}

				// Skip cold storage files
				if (entry.storage_tier === "cold") {
					return false
				}

				// If sinceTimestamp is provided, only include files read after that time
				if (sinceTimestamp && entry.mirror_read_date) {
					return entry.mirror_read_date >= sinceTimestamp
				}

				return true
			})

			// Sort by mirror_read_date descending (most recent first)
			// Entries without a date go to the end
			readEntries.sort((a, b) => {
				const dateA = a.mirror_read_date ?? 0
				const dateB = b.mirror_read_date ?? 0
				return dateB - dateA
			})

			// Deduplicate while preserving order (first occurrence = most recent read)
			const seen = new Set<string>()
			const uniquePaths: string[] = []
			for (const entry of readEntries) {
				if (!seen.has(entry.path)) {
					seen.add(entry.path)
					uniquePaths.push(entry.path)
				}
			}

			return uniquePaths
		} catch (error) {
			console.error("Failed to get files read by Mirror VS:", error)
			return []
		}
	}

	async forgetFile(filePath: string): Promise<void> {
		try {
			const metadata = await this.getTaskMetadata(this.taskId)
			metadata.files_in_context = metadata.files_in_context.filter((entry) => entry.path !== filePath)
			await this.saveTaskMetadata(this.taskId, metadata)

			// Also dispose of the file watcher if it exists
			const watcher = this.fileWatchers.get(filePath)
			if (watcher) {
				watcher.dispose()
				this.fileWatchers.delete(filePath)
			}
		} catch (error) {
			console.error("Failed to forget file context:", error)
		}
	}

	async toggleFileStorageTier(filePath: string, tier: "hot" | "cold"): Promise<void> {
		try {
			const metadata = await this.getTaskMetadata(this.taskId)
			let updated = false
			metadata.files_in_context.forEach((entry) => {
				if (entry.path === filePath) {
					entry.storage_tier = tier
					updated = true
				}
			})

			// If it wasn't tracked yet, track it now with the specific tier
			if (!updated) {
				metadata.files_in_context.push({
					path: filePath,
					record_state: "active",
					record_source: "read_tool",
					storage_tier: tier,
					mirror_read_date: Date.now(),
					mirror_edit_date: null,
				})
			}

			await this.saveTaskMetadata(this.taskId, metadata)
		} catch (error) {
			console.error("Failed to toggle file storage tier:", error)
		}
	}

	getAndClearCheckpointPossibleFile(): string[] {
		const files = Array.from(this.checkpointPossibleFiles)
		this.checkpointPossibleFiles.clear()
		return files
	}

	// Marks a file as edited by Mirror VS to prevent false positives in file watchers
	markFileAsEditedByMirror(filePath: string): void {
		this.recentlyEditedByMirror.add(filePath)
	}

	// Disposes all file watchers
	dispose(): void {
		for (const watcher of this.fileWatchers.values()) {
			watcher.dispose()
		}
		this.fileWatchers.clear()
	}
}
