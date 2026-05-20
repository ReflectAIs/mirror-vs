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
   * Returns true if the command looks like a long-running server/watcher.
   * These background quickly (4s). Everything else (installs, builds, tests)
   * waits up to 60s to collect the full output before backgrounding.
   */
  private isServerCommand(cmd: string): boolean {
    const serverPatterns = [
      /\bnpm\s+(run\s+)?(start|dev|serve|watch|preview)\b/i,
      /\bpnpm\s+(run\s+)?(start|dev|serve|watch|preview)\b/i,
      /\byarn\s+(start|dev|serve|watch|preview)\b/i,
      /\bpython\d*\s+-m\s+http\.server\b/i,
      /\bpython\d*\s+.*server\b/i,
      /\blive-server\b/i,
      /\bserve\b/i,
      /\bnodemon\b/i,
      /\bvite\b(?!.*build)/i,
      /\bnext\s+dev\b/i,
    ];
    return serverPatterns.some(p => p.test(cmd));
  }

  /**
   * Executes a terminal command within the active workspace root.
   *
   * - Server/watcher commands (npm run dev, python -m http.server, etc.) are
   *   backgrounded after 4 seconds and return their initial output.
   * - All other commands (npm install, npm run build, tests, etc.) wait up to
   *   60 seconds for full completion before being considered a background task.
   */
  public async executeCommand(commandString: string): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder is currently open.');
    }

    this.logToDebug(`Executing command: "${commandString}"`);

    const isServer = this.isServerCommand(commandString);
    // Server commands background after 4s; install/build commands wait up to 60s.
    const backgroundAfterMs = isServer ? 4000 : 60000;

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(commandString, {
        shell: true,
        cwd: workspaceFolder,
        env: { ...process.env, FORCE_COLOR: '1' }
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';
      let hasResolved = false;

      const pid = child.pid;
      if (pid) {
        this.activeProcesses.set(pid, child);
      }

      const safeResolve = (value: string) => {
        if (!hasResolved) {
          hasResolved = true;
          resolve(value);
        }
      };
      const safeReject = (err: Error) => {
        if (!hasResolved) {
          hasResolved = true;
          reject(err);
        }
      };

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

      // Background fallback timer
      const backgroundTimeout = setTimeout(() => {
        if (pid) {
          this.logToDebug(`Command PID ${pid} backgrounded after ${backgroundAfterMs}ms (isServer=${isServer}).`);
        }
        const partialOutput = [stdoutBuffer.trim(), stderrBuffer.trim()].filter(Boolean).join('\n');
        safeResolve(
          isServer
            ? `Server command is running in the background (PID: ${pid}).\n\nInitial Output:\n${partialOutput || '[No output yet]'}\n\nUse a browser tool or run_command to verify it is ready.`
            : `Command timed out after ${backgroundAfterMs / 1000}s and is still running in the background (PID: ${pid}).\n\nPartial Output:\n${partialOutput || '[No output yet]'}\n\nVerify completion by checking the expected output (e.g. list the directory or run a follow-up command).`
        );
      }, backgroundAfterMs);

      child.on('close', (code) => {
        clearTimeout(backgroundTimeout);
        if (pid) {
          this.activeProcesses.delete(pid);
        }

        const combinedOutput = [stdoutBuffer.trim(), stderrBuffer.trim()].filter(Boolean).join('\n');
        this.logToDebug(`Command PID ${pid} closed with exit code: ${code}`);

        if (code === 0 || code === null) {
          safeResolve(combinedOutput || 'Command completed successfully with no output.');
        } else {
          safeReject(
            new Error(`Command failed with exit code ${code}.\nOutput:\n${combinedOutput || '[No output]'}`)
          );
        }
      });

      child.on('error', (err) => {
        clearTimeout(backgroundTimeout);
        if (pid) {
          this.activeProcesses.delete(pid);
        }
        this.logToDebug(`Command PID ${pid} error: ${err.message}`);
        safeReject(new Error(`Failed to start command: ${err.message}`));
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
