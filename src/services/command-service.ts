
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export class CommandService {
  private static instance: CommandService;
  private activeProcesses: Map<number, child_process.ChildProcess> = new Map();
  // Track VS Code terminals that were created for agent commands
  private activeTerminals: Map<string, vscode.Terminal> = new Map();
  // Track which terminal names correspond to running agent commands
  private terminalCommandMap: Map<string, { command: string; isServer: boolean }> = new Map();

  private constructor() {
    // Clean up on extension shutdown / workspace change
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.cleanup());

    // Listen for terminal close events to clean up our tracking
    vscode.window.onDidCloseTerminal((terminal) => {
      const name = terminal.name;
      if (this.activeTerminals.has(name)) {
        this.activeTerminals.delete(name);
        this.terminalCommandMap.delete(name);
      }
    });
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
      /\bng\s+serve\b/i,
      /\bwebpack-dev-server\b/i,
      /\bts-node\b/i,
    ];
    return serverPatterns.some(p => p.test(cmd));
  }

  /**
   * Generate a unique terminal name for a command.
   */
  private getTerminalName(command: string): string {
    // Truncate command for the name
    const shortName = command.length > 30 ? command.substring(0, 30) + '…' : command;
    return `Mirror: ${shortName}`;
  }

  /**
   * Returns all active agent-managed VS Code terminals.
   * This allows the UI to list them and let users pick which one to reveal.
   */
  public getActiveTerminals(): { name: string; command: string; isServer: boolean }[] {
    const result: { name: string; command: string; isServer: boolean }[] = [];
    for (const [name, info] of this.terminalCommandMap) {
      // Make sure the terminal still exists
      const terminal = this.activeTerminals.get(name);
      if (terminal && terminal.exitStatus === undefined) {
        result.push({ name, command: info.command, isServer: info.isServer });
      } else {
        // Clean up stale entries
        this.activeTerminals.delete(name);
        this.terminalCommandMap.delete(name);
      }
    }
    return result;
  }

  /**
   * Reveal a specific terminal by name. Returns true if found and shown.
   */
  public revealTerminal(name: string): boolean {
    const terminal = this.activeTerminals.get(name);
    if (terminal && terminal.exitStatus === undefined) {
      terminal.show(false); // false = don't steal focus from sidebar
      return true;
    }
    return false;
  }

  /**
   * Execute a terminal command. For server/long-running commands,
   * creates a VS Code terminal so the user can see output and interact.
   * For short commands (install, build, etc.), uses a hidden child process.
   */
  public async executeCommand(commandString: string): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      throw new Error('No workspace folder is currently open.');
    }

    this.logToDebug(`Executing command: "${commandString}"`);

    const isServer = this.isServerCommand(commandString);

    // For server/watcher commands, use a VS Code terminal
    if (isServer) {
      return this.executeInTerminal(commandString, workspaceFolder);
    }

    // For short commands, use hidden child process with timeout
    return this.executeInBackground(commandString, workspaceFolder);
  }

  /**
   * Execute a command in a VS Code terminal so the user can see/interact.
   */
  private async executeInTerminal(commandString: string, cwd: string): Promise<string> {
    const terminalName = this.getTerminalName(commandString);

    // Check if we already have a terminal running this command
    let terminal = this.activeTerminals.get(terminalName);

    if (!terminal || terminal.exitStatus !== undefined) {
      // Create a new terminal
      terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd: cwd,
        // Preserve the environment so user's PATH etc. is available
      });

      // Track it
      this.activeTerminals.set(terminalName, terminal);
      this.terminalCommandMap.set(terminalName, {
        command: commandString,
        isServer: true,
      });

      // Send the command
      terminal.sendText(commandString, true);

      this.logToDebug(`Created VS Code terminal "${terminalName}" for server command: "${commandString}"`);

      // Show the terminal to the user so they can see progress
      terminal.show(false); // false = don't steal focus from sidebar
    } else {
      // Terminal already exists — just reveal it
      terminal.show(false);
      this.logToDebug(`Revealed existing VS Code terminal "${terminalName}"`);
    }

    return `Command is running in VS Code terminal "${terminalName}".\n\nOpen the terminal from the VS Code Terminal panel or use the Mirror VS terminal toggle button to view progress.`;
  }

  /**
   * Execute a command in a hidden child process (for short commands).
   */
  private executeInBackground(commandString: string, cwd: string): Promise<string> {
    const backgroundAfterMs = 60000; // 60s timeout for short commands

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(commandString, {
        shell: true,
        cwd: cwd,
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
          this.logToDebug(`Command PID ${pid} backgrounded after ${backgroundAfterMs}ms.`);
        }
        const partialOutput = [stdoutBuffer.trim(), stderrBuffer.trim()].filter(Boolean).join('\n');
        safeResolve(
          `Command timed out after ${backgroundAfterMs / 1000}s and is still running in the background (PID: ${pid}).\n\nPartial Output:\n${partialOutput || '[No output yet]'}\n\nVerify completion by checking the expected output (e.g. list the directory or run a follow-up command).`
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
   * Terminate all background processes and clean up terminals on shutdown.
   */
  public cleanup() {
    this.logToDebug('Cleaning up all running processes...');
    for (const [pid, proc] of this.activeProcesses.entries()) {
      proc.kill('SIGKILL');
      this.logToDebug(`Killed process PID ${pid} during cleanup.`);
    }
    this.activeProcesses.clear();

    // Don't kill VS Code terminals — they belong to the user now.
    // Just clear our tracking maps.
    this.activeTerminals.clear();
    this.terminalCommandMap.clear();
  }
}
