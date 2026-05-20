import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class CommandService {
  private static instance: CommandService;
  private activeProcesses: Map<number, child_process.ChildProcess> = new Map();

  private constructor() {
    // Kill all active processes on extension shutdown
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.cleanup());
  }

  public static getInstance(): CommandService {
    if (!CommandService.instance) {
      CommandService.instance = new CommandService();
    }
    return CommandService.instance;
  }

  private logToDebug(message: string) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const logDir = path.join(workspaceFolder, '.mirror-vs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, 'debug.log');
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logFile, `[${timestamp}] [CommandService] ${message}\n`);
      }
    } catch (e) {
      console.error('Failed to write command debug log', e);
    }
  }

  /**
   * Executes a terminal command within the active workspace root.
   * If the command completes quickly (within 2 seconds), it returns the complete output.
   * If it keeps running (like a dev server), it is run in the background and returns the initial output.
   */
  public async executeCommand(commandString: string): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder is currently open.');
    }

    this.logToDebug(`Executing command: "${commandString}"`);

    return new Promise((resolve, reject) => {
      // Use shell: true to support chained commands, pipes, and environment variables
      const child = child_process.spawn(commandString, {
        shell: true,
        cwd: workspaceFolder,
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let hasCompleted = false;

      const pid = child.pid;
      if (pid) {
        this.activeProcesses.set(pid, child);
      }

      child.stdout?.on('data', (data) => {
        const str = data.toString();
        stdoutBuffer += str;
        this.logToDebug(`[PID ${pid} STDOUT] ${str.trim()}`);
      });

      child.stderr?.on('data', (data) => {
        const str = data.toString();
        stderrBuffer += str;
        this.logToDebug(`[PID ${pid} STDERR] ${str.trim()}`);
      });

      // Timer to check if it's a long-running background command
      const backgroundTimeout = setTimeout(() => {
        if (!hasCompleted && pid) {
          this.logToDebug(`Command PID ${pid} assumed to be running in background.`);
          resolve(
            `Command is running in the background (PID: ${pid}).\n\nInitial Output:\n${stdoutBuffer || '[No stdout yet]'}\n${stderrBuffer ? `\nErrors:\n${stderrBuffer}` : ''}`
          );
        }
      }, 2500);

      child.on('close', (code) => {
        hasCompleted = true;
        clearTimeout(backgroundTimeout);
        if (pid) {
          this.activeProcesses.delete(pid);
        }

        const combinedOutput = `${stdoutBuffer.trim()}\n${stderrBuffer.trim()}`.trim();
        this.logToDebug(`Command PID ${pid} closed with exit code: ${code}`);

        if (code === 0) {
          resolve(combinedOutput || 'Command executed successfully with no output.');
        } else {
          reject(
            new Error(
              `Command failed with exit code ${code}.\nOutput:\n${combinedOutput || '[No output]'}`
            )
          );
        }
      });

      child.on('error', (err) => {
        hasCompleted = true;
        clearTimeout(backgroundTimeout);
        if (pid) {
          this.activeProcesses.delete(pid);
        }
        this.logToDebug(`Command PID ${pid} error: ${err.message}`);
        reject(new Error(`Failed to start command: ${err.message}`));
      });
    });
  }

  /**
   * Kills a background process by PID.
   */
  public killProcess(pid: number): boolean {
    const proc = this.activeProcesses.get(pid);
    if (proc) {
      this.logToDebug(`Killing process PID ${pid}`);
      proc.kill('SIGTERM');
      this.activeProcesses.delete(pid);
      return true;
    }
    return false;
  }

  /**
   * Terminate all background processes on shutdown.
   */
  public cleanup() {
    this.logToDebug('Cleaning up all running processes...');
    for (const [pid, proc] of this.activeProcesses.entries()) {
      proc.kill('SIGKILL');
      this.logToDebug(`Killed process PID ${pid} during cleanup.`);
    }
    this.activeProcesses.clear();
  }
}
