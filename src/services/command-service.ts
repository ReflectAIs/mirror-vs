
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
    const shortName = command.length > 30 ? command.substring(0, 30) + '\u2026' : command;
    return `Mirror: ${shortName}`;
  }

  /**
   * Resolve a command that may contain a leading `cd <dir>` prefix.
   * Instead of rewriting shell syntax (which breaks across shells), we extract
   * the directory and set it as the spawn cwd. This is shell-agnostic and
   * works identically on PowerShell, cmd.exe, bash, and zsh.
   *
   * Examples:
   *   "cd todoa-app && python -m http.server"  → { cmd: "python -m http.server", cwd: ".../todoa-app" }
   *   "cd todoa-app; python -m http.server"    → { cmd: "python -m http.server", cwd: ".../todoa-app" }
   *   "python -m http.server"                  → { cmd: "python -m http.server", cwd: unchanged }
   */
  private resolveCommandAndCwd(command: string, baseCwd: string): { cmd: string; cwd: string } {
    // Match: cd <dir> followed by && or ; or end-of-string
    // Use greedy + (not lazy +?) so the full directory name is captured,
    // not just the first character.
    const cdPattern = /^\s*cd\s+(['"]?)([^'"&;|\r\n]+)\1\s*(?:&&|;)?\s*/i;
    const cdMatch = command.match(cdPattern);

    if (cdMatch) {
      const dir = cdMatch[2].trim();
      const resolvedCwd = path.resolve(baseCwd, dir);
      const remainingCmd = command.slice(cdMatch[0].length).trim();
      this.logToDebug(`cd prefix extracted: cwd set to "${resolvedCwd}", running: "${remainingCmd}"`);
      return { cmd: remainingCmd || command, cwd: resolvedCwd };
    }

    return { cmd: command, cwd: baseCwd };
  }

  /**
   * Returns the shell option for child_process.spawn.
   * Since resolveCommandAndCwd strips all `cd X &&` prefixes before spawning,
   * commands never contain shell-specific syntax — cmd.exe (shell: true) works fine.
   */
  private getSpawnShell(): boolean {
    return true;
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

    // Extract any leading `cd <dir>` prefix and resolve it as the spawn cwd.
    // This is shell-agnostic — avoids Set-Location vs cd inconsistencies.
    const { cmd, cwd } = this.resolveCommandAndCwd(commandString, workspaceFolder);

    this.logToDebug(`Executing command: "${cmd}" (cwd: "${cwd}")`);

    const isServer = this.isServerCommand(cmd);

    if (isServer) {
      // For VS Code terminal, send the ORIGINAL command string (terminal handles its own cwd)
      return this.executeInTerminal(cmd, cwd, commandString);
    }

    return this.executeInBackground(cmd, cwd);
  }

  /**
   * Extract port number from a server command string.
   */
  private extractPort(command: string): number | null {
    const patterns = [
      /http\.server\s+(\d+)/i,          // python -m http.server 8080
      /(?:-p|--port)[=\s]+(\d+)/i,      // -p 3000 or --port=3000
      /:(\d{4,5})\b/,                   // :8080
      /\b(\d{4,5})\s*$/,                // trailing port number
    ];
    for (const p of patterns) {
      const m = command.match(p);
      if (m) { return parseInt(m[1], 10); }
    }
    return null;
  }

  /**
   * Probe a local TCP port. Returns true if something is listening.
   */
  private probePort(port: number, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const net = require('net') as typeof import('net');
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => { resolve(false); });
      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Execute a server/long-running command in a VS Code terminal (visible to user).
   * Uses TCP port probing instead of a parallel hidden spawn to avoid port conflicts.
   * - If the terminal already exists: return immediately (do NOT re-launch the server).
   * - If the terminal is new: wait for the server to boot, probe the port, report status.
   */
  private async executeInTerminal(commandString: string, cwd: string, originalCommand?: string): Promise<string> {
    const terminalName = this.getTerminalName(originalCommand || commandString);

    // --- Pre-launch: check if the target port is already occupied ---
    // This catches the case where a DIFFERENT server (different terminal name)
    // is already using the port, preventing EADDRINUSE crashes.
    const port = this.extractPort(commandString);
    if (port) {
      const portOccupied = await this.probePort(port, 800);
      if (portOccupied) {
        this.logToDebug(`Port ${port} already occupied before launch — skipping new terminal.`);
        return [
          `⚠️ Port ${port} is already in use — a server is already running there.`,
          `Do NOT start another server. Navigate directly to the existing one:`,
          `Use: browser_navigate url="http://localhost:${port}"`,
        ].join('\n');
      }
    }

    // --- Deduplication by terminal name ---
    let terminal = this.activeTerminals.get(terminalName);
    const alreadyRunning = !!(terminal && terminal.exitStatus === undefined);

    if (!alreadyRunning) {
      terminal = vscode.window.createTerminal({ name: terminalName, cwd });
      this.activeTerminals.set(terminalName, terminal);
      this.terminalCommandMap.set(terminalName, { command: commandString, isServer: true });
      terminal.sendText(commandString, true);
      this.logToDebug(`Created VS Code terminal "${terminalName}" (cwd: "${cwd}"): "${commandString}"`);
      terminal.show(false);
    } else {
      terminal!.show(false);
      this.logToDebug(`Terminal "${terminalName}" already running — not re-launching.`);
      return `Server is already running in VS Code terminal "${terminalName}". Use browser_navigate to verify it is accessible.`;
    }

    // --- Post-launch: wait then probe the port ---
    const BOOT_WAIT_MS = 4000;
    this.logToDebug(`Waiting ${BOOT_WAIT_MS}ms for server to boot on port ${port ?? '(unknown)'}...`);
    await new Promise(r => setTimeout(r, BOOT_WAIT_MS));

    if (port) {
      const isUp = await this.probePort(port);
      if (isUp) {
        this.logToDebug(`Port ${port} is OPEN — server is up.`);
        return [
          `✅ Server is UP on port ${port}.`,
          `NEXT STEP: You MUST navigate to http://localhost:${port} — do NOT use any other port.`,
          `Use: browser_navigate url="http://localhost:${port}"`,
        ].join('\n');
      } else {
        this.logToDebug(`Port ${port} did not respond after ${BOOT_WAIT_MS}ms.`);
        return [
          `⚠️ Server launched but port ${port} is not responding yet after ${BOOT_WAIT_MS / 1000}s.`,
          `Check terminal "${terminalName}" for errors.`,
          `If the server is still starting, use: browser_navigate url="http://localhost:${port}"`,
        ].join('\n');
      }
    }

    return `Server command launched in terminal "${terminalName}". No port detected in command — use browser_navigate to verify the app is accessible.`;
  }

  /**
   * Execute a command in a hidden child process (for short commands).
   */
  private executeInBackground(commandString: string, cwd: string): Promise<string> {
    const backgroundAfterMs = 60000; // 60s timeout for short commands

    return new Promise((resolve, reject) => {
      const child = child_process.spawn(commandString, {
        shell: this.getSpawnShell(),
        cwd,
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
        if (pid) { this.activeProcesses.delete(pid); }
        this.logToDebug(`Command PID ${pid} closed with exit code: ${code}`);

        const stdout = stdoutBuffer.trim();
        const stderr = stderrBuffer.trim();

        // Always surface BOTH stdout and stderr — many tools write real errors
        // to stderr even with exit code 0 (e.g. curl option errors, python warnings)
        const combined = [
          stdout && `STDOUT:\n${stdout}`,
          stderr && `STDERR:\n${stderr}`,
        ].filter(Boolean).join('\n\n');

        if (code === 0 || code === null) {
          safeResolve(combined || 'Command completed with no output.');
        } else {
          safeReject(new Error(`Command failed (exit code ${code}).\n\nOutput:\n${combined || '[No output]'}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(backgroundTimeout);
        if (pid) { this.activeProcesses.delete(pid); }
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
   * Sends input text or keys (like Ctrl+C) to a specific active terminal.
   */
  public sendInputToTerminal(terminalName: string, input: string): boolean {
    let terminal = this.activeTerminals.get(terminalName);
    if (!terminal) {
      // Fallback search across all active VS Code terminals by name
      terminal = vscode.window.terminals.find(t => t.name === terminalName);
    }

    if (terminal) {
      this.logToDebug(`Sending input to terminal "${terminalName}": "${input}"`);
      if (input === 'Ctrl+C' || input === 'ctrl+c' || input === '\u0003') {
        terminal.sendText('\u0003', false);
      } else {
        terminal.sendText(input, true);
      }
      return true;
    }
    return false;
  }

  /**
   * Closes and disposes a specific active terminal.
   */
  public closeTerminal(terminalName: string): boolean {
    let terminal = this.activeTerminals.get(terminalName);
    if (!terminal) {
      // Fallback search
      terminal = vscode.window.terminals.find(t => t.name === terminalName);
    }

    if (terminal) {
      this.logToDebug(`Disposing/closing terminal "${terminalName}"`);
      terminal.dispose();
      this.activeTerminals.delete(terminalName);
      this.terminalCommandMap.delete(terminalName);
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

    // Kill VS Code terminals that we started so they don't carry forward!
    this.logToDebug('Cleaning up active VS Code terminals...');
    for (const [name, terminal] of this.activeTerminals.entries()) {
      try {
        terminal.dispose();
      } catch (e) {
        // ignore
      }
    }
    this.activeTerminals.clear();
    this.terminalCommandMap.clear();
  }
}
