import * as vscode from "vscode"
import * as fs from "fs"
import * as path from "path"

export interface Checkpoint {
    id: string
    timestamp: number
    filePath: string // Absolute path to original file
    backupPath: string | null // Path to backup file, or null if it was a new file (didn't exist)
    type: "replace" | "create"
}

// Global active checkpoints map to allow quick reverts via notifications
const activeCheckpoints = new Map<string, Checkpoint>()

/**
 * Creates a checkpoint for a file.
 * Returns the checkpoint ID.
 */
export async function createCheckpoint(filePath: string, type: "replace" | "create"): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    if (!workspaceFolder) {
        throw new Error("No workspace folder open. Checkpoints cannot be created.")
    }

    const checkpointsDir = path.join(workspaceFolder, ".mirror-vs", "checkpoints")
    if (!fs.existsSync(checkpointsDir)) {
        fs.mkdirSync(checkpointsDir, { recursive: true })
    }

    const id = `cp_${Date.now()}`
    const fileExists = fs.existsSync(filePath)
    let backupPath: string | null = null

    if (fileExists) {
        const fileContent = fs.readFileSync(filePath)
        const fileName = path.basename(filePath)
        backupPath = path.join(checkpointsDir, `${fileName}_${id}.bak`)
        fs.writeFileSync(backupPath, fileContent)
    }

    const checkpoint: Checkpoint = {
        id,
        timestamp: Date.now(),
        filePath,
        backupPath,
        type,
    }

    activeCheckpoints.set(id, checkpoint)

    // Keep a clean checkpoints log file inside `.mirror-vs/checkpoints/manifest.json`
    const manifestPath = path.join(checkpointsDir, "manifest.json")
    let manifest: Checkpoint[] = []
    try {
        if (fs.existsSync(manifestPath)) {
            manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
        }
    } catch (e) {
        // Ignore reading errors
    }
    manifest.push(checkpoint)
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8")

    return id
}

/**
 * Reverts a checkpoint by its ID.
 */
export async function revertCheckpoint(id: string): Promise<boolean> {
    let checkpoint = activeCheckpoints.get(id)

    if (!checkpoint) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        if (workspaceFolder) {
            const manifestPath = path.join(workspaceFolder, ".mirror-vs", "checkpoints", "manifest.json")
            try {
                if (fs.existsSync(manifestPath)) {
                    const manifest: Checkpoint[] = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
                    const found = manifest.find((cp) => cp.id === id)
                    if (found) {
                        checkpoint = found
                        activeCheckpoints.set(id, checkpoint)
                    }
                }
            } catch (e) {
                console.error("Error loading checkpoint from manifest:", e)
            }
        }
    }

    if (!checkpoint) {
        vscode.window.showErrorMessage(`Checkpoint ${id} not found.`)
        return false
    }

    try {
        if (checkpoint.backupPath && fs.existsSync(checkpoint.backupPath)) {
            // Restore original file
            const originalContent = fs.readFileSync(checkpoint.backupPath)
            // Ensure directory exists
            const parentDir = path.dirname(checkpoint.filePath)
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true })
            }
            fs.writeFileSync(checkpoint.filePath, originalContent)
            vscode.window.showInformationMessage(`Reverted changes to ${path.basename(checkpoint.filePath)}!`)
        } else {
            // The file was new and did not exist before this checkpoint. Delete it!
            if (fs.existsSync(checkpoint.filePath)) {
                fs.unlinkSync(checkpoint.filePath)
            }
            vscode.window.showInformationMessage(`Reverted file creation. Deleted ${path.basename(checkpoint.filePath)}!`)
        }

        // Remove from active list
        activeCheckpoints.delete(id)
        return true
    } catch (error: any) {
        vscode.window.showErrorMessage(`Failed to revert checkpoint: ${error.message}`)
        return false
    }
}
