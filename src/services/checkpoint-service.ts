/**
 * Checkpoint Service — Git-based snapshot system for atomic file operations.
 * Creates git snapshots before dangerous tool operations and enables rollback.
 * Adapted from Roo Code's checkpoint system.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface Checkpoint {
  id: string;
  filePath: string;
  hash: string;
  timestamp: number;
  operation: 'replace' | 'create' | 'delete';
}

export class CheckpointService {
  private static instance: CheckpointService;
  private checkpoints: Map<string, Checkpoint> = new Map();
  private workspaceRoot: string;

  private constructor() {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = folders?.[0]?.uri.fsPath || '';
  }

  static getInstance(): CheckpointService {
    if (!CheckpointService.instance) {
      CheckpointService.instance = new CheckpointService();
    }
    return CheckpointService.instance;
  }

  /**
   * Creates a git checkpoint for a file before modification.
   * Stores the current git hash so we can restore if needed.
   */
  async createCheckpoint(filePath: string, operation: Checkpoint['operation']): Promise<string> {
    try {
      const resolved = path.resolve(this.workspaceRoot, filePath);
      const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Stage the file in git to capture its state
      const hasGit = await this.hasGitRepo();
      let hash = '';

      if (hasGit) {
        try {
          await execAsync(`git add "${resolved}"`, { cwd: this.workspaceRoot });
          const { stdout } = await execAsync(`git hash-object "${resolved}"`, {
            cwd: this.workspaceRoot,
          });
          hash = stdout.trim();
        } catch {
          // Not critical — just store a reference hash from file content
          const content = await vscode.workspace.fs
            .readFile(vscode.Uri.file(resolved))
            .then((buf) => Buffer.from(buf).toString('hex').slice(0, 40));
          hash = content;
        }
      }

      const checkpoint: Checkpoint = {
        id,
        filePath: resolved,
        hash,
        timestamp: Date.now(),
        operation,
      };

      this.checkpoints.set(id, checkpoint);
      return id;
    } catch (error) {
      console.warn('Checkpoint creation failed:', error);
      return `cp_fallback_${Date.now()}`;
    }
  }

  /**
   * Reverts a file to a previous checkpoint state using git restore.
   */
  async revertCheckpoint(id: string): Promise<boolean> {
    const checkpoint = this.checkpoints.get(id);
    if (!checkpoint) {
      return false;
    }

    try {
      const hasGit = await this.hasGitRepo();

      if (hasGit && checkpoint.hash) {
        // Restore file to the staged version
        await execAsync(`git checkout -f "${checkpoint.filePath}"`, {
          cwd: this.workspaceRoot,
        });
        this.checkpoints.delete(id);
        return true;
      }

      // Non-git fallback: we can't truly roll back without git
      return false;
    } catch (error) {
      console.warn('Checkpoint revert failed:', error);
      return false;
    }
  }

  /**
   * Gets a checkpoint by ID.
   */
  getCheckpoint(id: string): Checkpoint | undefined {
    return this.checkpoints.get(id);
  }

  /**
   * Purges checkpoints older than the specified age in milliseconds.
   */
  purgeOldCheckpoints(maxAgeMs: number = 30 * 60 * 1000): void {
    const now = Date.now();
    for (const [id, cp] of this.checkpoints) {
      if (now - cp.timestamp > maxAgeMs) {
        this.checkpoints.delete(id);
      }
    }
  }

  private async hasGitRepo(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.workspaceRoot });
      return true;
    } catch {
      return false;
    }
  }
}
