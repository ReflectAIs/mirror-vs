import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max bytes to retain in each terminal's output buffer (~100 KB). */
const MAX_OUTPUT_BUFFER = 100 * 1024;

/** How long to wait for a short command before declaring it backgrounded. */
const SHORT_CMD_TIMEOUT_MS = 60_000;

/** How long to wait after launching a server before probing the port. */
const SERVER_BOOT_WAIT_MS = 4_000;

// ---------------------------------------------------------------------------
// MirrorPseudoterminal — visible VS Code terminal backed by child_process
// ---------------------------------------------------------------------------

/**
 * A custom Pseudoterminal that spawns a real shell process, displays its
 * output in a VS Code terminal panel, and buffers the output so the agent
 * can read it programmatically via `read_terminal`.
 */
export class MirrorPseudoterminal implements vscode.Pseudoterminal {
  // ---- VS Code Pseudoterminal events ----
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  public onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  public onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

  // ---- Internal state ----
  private process?: child_process.ChildProcess;
  private outputBuffer = '';
  private _exitCode: number | null = null;
  private _running = false;
  public readonly spawnedPids = new Set<number>();

  /** Resolves when the process exits. */
  public readonly exitPromise: Promise<{ code: number | null; output: string }>;
  private _resolveExit!: (v: { code: number | null; output: string }) => void;

  constructor(
    private readonly command: string,
    private readonly cwd: string,
    private readonly terminalName: string,
  ) {
    this.exitPromise = new Promise((resolve) => {
      this._resolveExit = resolve;
    });
  }

  // ---- Public getters ----

  get running(): boolean {
    return this._running;
  }
  get exitCode(): number | null {
    return this._exitCode;
  }

  /** Returns the full buffered output (ANSI-stripped). */
  getFullOutput(): string {
    return this.outputBuffer;
  }

  /** Returns the last `chars` characters of buffered output. */
  getRecentOutput(chars: number = 5000): string {
    if (this.outputBuffer.length <= chars) {
      return this.outputBuffer;
    }
    return this.outputBuffer.slice(-chars);
  }

  // ---- Pseudoterminal lifecycle ----

  open(_initialDimensions: vscode.TerminalDimensions | undefined): void {
    this._running = true;

    // Show the command being executed
    this.writeEmitter.fire(`\x1b[90m$ ${this.command}\x1b[0m\r\n`);

    const shellExecutable = process.platform === 'win32' ? 'powershell.exe' : true;
    this.process = child_process.spawn(this.command, {
      shell: shellExecutable,
      cwd: this.cwd,
      env: { ...process.env, FORCE_COLOR: '1' },
      detached: true,
    });

    if (this.process.pid) {
      this.spawnedPids.add(this.process.pid);
    }

    this.process.stdout?.on('data', (data: Buffer) => {
      const str = data.toString();
      this.appendOutput(str);
      this.writeEmitter.fire(str.replace(/\r?\n/g, '\r\n'));
      CommandService.emitStreamData(this.terminalName, str);
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const str = data.toString();
      this.appendOutput(str);
      this.writeEmitter.fire(str.replace(/\r?\n/g, '\r\n'));
      CommandService.emitStreamData(this.terminalName, str);
    });

    this.process.on('close', (code) => {
      this._running = false;
      this._exitCode = code;
      this.writeEmitter.fire(`\r\n\x1b[90m[Process exited with code ${code ?? 0}]\x1b[0m\r\n`);
      this._resolveExit({ code, output: this.outputBuffer });
    });

    this.process.on('error', (err) => {
      this._running = false;
      this._exitCode = -1;
      const msg = `Failed to start command: ${err.message}`;
      this.appendOutput(msg);
      this.writeEmitter.fire(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
      this._resolveExit({ code: -1, output: this.outputBuffer });
    });
  }

  close(): void {
    if (this.process && this._running) {
      const pid = this.process.pid;
      if (pid) {
        if (process.platform === 'win32') {
          // Taskkill /T recursively forces termination of the process tree, /F enforces hard kill
          child_process.exec(`taskkill /pid ${pid} /T /F`, () => {
            this._running = false;
          });
        } else {
          try {
            // Passing a negative number (-PID) sends the signal to the entire Process Group (PGID)
            process.kill(-pid, 'SIGKILL');
          } catch (e) {
            try {
              this.process.kill('SIGKILL');
            } catch (_) {}
          }
          this._running = false;
        }
      } else {
        this.process.kill();
        this._running = false;
      }
    }
  }

  handleInput(data: string): void {
    if (!this.process || !this._running) {
      return;
    }
    // Ctrl+C
    if (data === '\x03') {
      const pid = this.process.pid;
      if (pid && process.platform !== 'win32') {
        try {
          process.kill(-pid, 'SIGINT');
        } catch {
          this.process.kill('SIGINT');
        }
      } else {
        this.process.kill('SIGINT');
      }
      return;
    }
    this.process.stdin?.write(data);
  }

  // ---- Private helpers ----

  /** Strip ANSI escape codes for the clean buffer the agent reads. */
  private stripAnsi(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  }

  private appendOutput(str: string): void {
    this.outputBuffer += this.stripAnsi(str);
    // Trim to keep the buffer under MAX_OUTPUT_BUFFER
    if (this.outputBuffer.length > MAX_OUTPUT_BUFFER) {
      this.outputBuffer = this.outputBuffer.slice(-MAX_OUTPUT_BUFFER);
    }
  }
}

// ---------------------------------------------------------------------------
// CommandService — singleton managing all agent-driven terminals
// ---------------------------------------------------------------------------

export class CommandService {
  private static instance: CommandService;

  private static readonly _onDidStreamData = new vscode.EventEmitter<{ name: string; data: string }>();
  public static readonly onDidStreamData = CommandService._onDidStreamData.event;

  public static emitStreamData(name: string, data: string) {
    CommandService._onDidStreamData.fire({ name, data });
  }

  /** Pseudoterminal reference by name (for output reading). */
  private activePtys: Map<string, MirrorPseudoterminal> = new Map();
  /** Command metadata by terminal name. */
  private terminalCommandMap: Map<string, { command: string; isServer: boolean }> = new Map();
  private isWindows = process.platform === 'win32';

  private constructor() {
    // Clean up on workspace change
    vscode.workspace.onDidChangeWorkspaceFolders(() => this.cleanup());
  }

  public static getInstance(): CommandService {
    if (!CommandService.instance) {
      CommandService.instance = new CommandService();
    }
    return CommandService.instance;
  }

  // -----------------------------------------------------------------------
  // Logging
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Command classification
  // -----------------------------------------------------------------------

  /** Returns true if the command looks like a long-running server/watcher. */
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
    return serverPatterns.some((p) => p.test(cmd));
  }

  // -----------------------------------------------------------------------
  // Terminal naming helpers
  // -----------------------------------------------------------------------

  /** Generate a unique terminal name for a command. */
  private getTerminalName(command: string): string {
    // Remove shell redirection, piping, and common special characters
    let clean = command
      .replace(/2>&1/g, '')
      .replace(/&&/g, 'and')
      .replace(/[;|<>&\r\n]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Limit naming to 60 chars maximum for safety and clean display
    if (clean.length > 60) {
      clean = clean.substring(0, 57).trim() + '...';
    }

    return `Mirror: ${clean}`;
  }

  // -----------------------------------------------------------------------
  // cwd / cd resolution
  // -----------------------------------------------------------------------

  /**
   * Resolve a command that may contain a leading `cd <dir>` prefix.
   * Extracts the directory and sets it as the spawn cwd.
   */
  private resolveCommandAndCwd(command: string, baseCwd: string): { cmd: string; cwd: string } {
    let normalizedCmd = command;

    // Windows: translate 'mkdir -p' to the correct PowerShell syntax
    if (process.platform === 'win32') {
      normalizedCmd = normalizedCmd.replace(
        /\bmkdir\b(\s+)-p\b/gi,
        (_, spaces) => `New-Item -Force -ItemType Directory${spaces}`,
      );
    }

    const cdPattern = /^\s*cd\s+(['"]?)([^'"&;|\r\n]+)\1\s*(?:&&|;)?\s*/i;
    const cdMatch = normalizedCmd.match(cdPattern);

    if (cdMatch) {
      const dir = cdMatch[2].trim();
      const resolvedCwd = path.resolve(baseCwd, dir);
      const remainingCmd = normalizedCmd.slice(cdMatch[0].length).trim();
      this.logToDebug(`cd prefix extracted: cwd set to "${resolvedCwd}", running: "${remainingCmd}"`);
      return { cmd: remainingCmd || normalizedCmd, cwd: resolvedCwd };
    }

    return { cmd: normalizedCmd, cwd: baseCwd };
  }

  // -----------------------------------------------------------------------
  // Port probing
  // -----------------------------------------------------------------------

  /** Extract port number from a server command string. */
  private extractPort(command: string): number | null {
    const patterns = [/http\.server\s+(\d+)/i, /(?:-p|--port)[=\s]+(\d+)/i, /:(\d{4,5})\b/, /\b(\d{4,5})\s*$/];
    for (const p of patterns) {
      const m = command.match(p);
      if (m) {
        return parseInt(m[1], 10);
      }
    }
    return null;
  }

  /** Probe a local TCP port. Returns true if something is listening. */
  private probePort(port: number, timeoutMs = 1500): Promise<boolean> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const net = require('net') as typeof import('net');
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        resolve(false);
      });
      socket.connect(port, '127.0.0.1');
    });
  }

  /**
   * Verifies port ownership by resolving the specific active PID and evaluating it against our active registry
   */
  public async verifyPortOwnership(port: number, expectedTargetName: string): Promise<{ active: boolean; matchesTarget: boolean; ownerPid?: number }> {
    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const net = require('net') as typeof import('net');
      const client = new net.Socket();
      
      client.once('connect', () => {
        client.destroy();
        
        // Port is active; query the OS to extract the exact PID mapping
        const lookupCmd = this.isWindows 
          ? `netstat -ano | findstr :${port} | findstr LISTENING`
          : `lsof -t -i :${port}`;

        child_process.exec(lookupCmd, (err, stdout) => {
          if (err || !stdout.trim()) {
            return resolve({ active: true, matchesTarget: false });
          }

          let resolvedPid: number | null = null;

          if (this.isWindows) {
            // netstat outputs lines matching format: TCP 0.0.0.0:8080 0.0.0.0:0 LISTENING 12345
            const parts = stdout.trim().split(/\s+/);
            const pidStr = parts[parts.length - 1];
            resolvedPid = parseInt(pidStr, 10);
          } else {
            // lsof -t directly returns raw lists of matching PIDs line by line
            const firstLine = stdout.trim().split('\n')[0];
            resolvedPid = parseInt(firstLine, 10);
          }

          if (!resolvedPid || isNaN(resolvedPid)) {
            return resolve({ active: true, matchesTarget: false });
          }

          const targetRegistry = this.activePtys.get(expectedTargetName);
          if (targetRegistry) {
            const isChildOrGrandchild = resolvedPid === (targetRegistry as any).process?.pid || targetRegistry.spawnedPids.has(resolvedPid);
            
            // Register this discovered PID to our tracked tree map to ensure future group drops intercept it
            if (isChildOrGrandchild) {
              targetRegistry.spawnedPids.add(resolvedPid);
            }

            return resolve({ active: true, matchesTarget: isChildOrGrandchild, ownerPid: resolvedPid });
          }

          return resolve({ active: true, matchesTarget: false, ownerPid: resolvedPid });
        });
      });

      client.once('error', () => {
        resolve({ active: false, matchesTarget: false });
      });

      client.connect({ port, host: '127.0.0.1' });
    });
  }

  // -----------------------------------------------------------------------
  // Terminal queries (used by tools & system prompt)
  // -----------------------------------------------------------------------

  /** Returns all active agent-managed VS Code terminals with their metadata. */
  public getActiveTerminals(): {
    name: string;
    command: string;
    isServer: boolean;
    running: boolean;
    exitCode: number | null;
  }[] {
    const result: { name: string; command: string; isServer: boolean; running: boolean; exitCode: number | null }[] =
      [];
    for (const [name, info] of this.terminalCommandMap) {
      const pty = this.activePtys.get(name);
      if (pty) {
        result.push({
          name,
          command: info.command,
          isServer: info.isServer,
          running: pty.running,
          exitCode: pty.exitCode,
        });
      } else {
        // Clean up stale entries
        this.terminalCommandMap.delete(name);
      }
    }
    return result;
  }

  /** Reveal a specific terminal by name. Returns true if found and shown. */
  public revealTerminal(_name: string): boolean {
    // Terminals are headless, nothing to show in VS Code terminal panel
    return false;
  }

  /**
   * Read recent output from a terminal's pseudoterminal buffer.
   * Returns null if the terminal is not found.
   */
  public readTerminalOutput(
    terminalName: string,
    chars: number = 5000,
  ): { output: string; running: boolean; exitCode: number | null } | null {
    const pty = this.activePtys.get(terminalName);
    if (pty) {
      return {
        output: pty.getRecentOutput(chars),
        running: pty.running,
        exitCode: pty.exitCode,
      };
    }

    // Normalized helper for extremely robust fuzzy matching
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/mirror:/i, '')
        .replace(/[^\w]/g, '');
    const normSearch = normalize(terminalName);

    if (normSearch) {
      for (const [name, p] of this.activePtys) {
        const normName = normalize(name);
        if (normName.includes(normSearch) || normSearch.includes(normName)) {
          this.logToDebug(`readTerminalOutput: fuzzy matched "${terminalName}" to active PTY "${name}"`);
          return {
            output: p.getRecentOutput(chars),
            running: p.running,
            exitCode: p.exitCode,
          };
        }
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Main entry point
  // -----------------------------------------------------------------------

  /**
   * Execute a terminal command. ALL commands now open a visible VS Code
   * terminal via MirrorPseudoterminal. Server commands return immediately
   * after port probing; short commands wait for exit and return output.
   */
  public async executeCommand(commandString: string, forceType?: 'script' | 'server'): Promise<string> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      throw new Error('No workspace folder is currently open.');
    }

    const workspaceFolder = folders[0].uri.fsPath;
    const { cmd, cwd } = this.resolveCommandAndCwd(commandString, workspaceFolder);
    this.logToDebug(`Executing command: "${cmd}" (cwd: "${cwd}")`);

    const isServer = forceType === 'server' || (forceType !== 'script' && this.isServerCommand(cmd));

    if (isServer) {
      return this.executeServerCommand(cmd, cwd, commandString);
    }

    return this.executeShortCommand(cmd, cwd, commandString);
  }

  // -----------------------------------------------------------------------
  // Server (long-running) commands
  // -----------------------------------------------------------------------

  private async executeServerCommand(cmd: string, cwd: string, originalCommand: string): Promise<string> {
    const terminalName = this.getTerminalName(originalCommand || cmd);

    // Pre-launch: check if the target port is already occupied
    const port = this.extractPort(cmd);
    if (port) {
      const portOwnership = await this.verifyPortOwnership(port, terminalName);
      if (portOwnership.active) {
        if (portOwnership.matchesTarget) {
          this.logToDebug(`Port ${port} already occupied by current target ${terminalName}.`);
          return `Server is already running in background process "${terminalName}". Use browser_navigate to verify it is accessible.`;
        }
        this.logToDebug(`Port ${port} already occupied by PID ${portOwnership.ownerPid} before launch.`);
        return [
          `⚠️ Port ${port} is already in use by process PID ${portOwnership.ownerPid || '(unknown)'} — a server is already running there.`,
          `Do NOT start another server. Navigate directly to the existing one:`,
          `Use: browser_navigate url="http://localhost:${port}"`,
        ].join('\n');
      }
    }

    // Deduplication by terminal name
    const existingPty = this.activePtys.get(terminalName);
    const alreadyRunning = !!(existingPty && existingPty.running);

    if (alreadyRunning) {
      this.logToDebug(`Terminal process "${terminalName}" already running — not re-launching.`);
      return `Server is already running in background process "${terminalName}". Use browser_navigate to verify it is accessible.`;
    }

    // Create pseudoterminal and open/spawn it manually
    const pty = new MirrorPseudoterminal(cmd, cwd, terminalName);
    pty.open(undefined);
    this.activePtys.set(terminalName, pty);
    this.terminalCommandMap.set(terminalName, { command: cmd, isServer: true });
    this.logToDebug(`Started headless terminal process "${terminalName}" (cwd: "${cwd}"): "${cmd}"`);

    // Wait for server to boot then probe the port
    this.logToDebug(`Waiting ${SERVER_BOOT_WAIT_MS}ms for server to boot on port ${port ?? '(unknown)'}...`);
    await new Promise((r) => setTimeout(r, SERVER_BOOT_WAIT_MS));

    if (port) {
      const isUp = await this.probePort(port);
      if (isUp) {
        this.logToDebug(`Port ${port} is OPEN — server is up.`);
        return [
          `✅ Server is UP on port ${port}. Terminal: "${terminalName}"`,
          `NEXT STEP: You MUST navigate to http://localhost:${port} — do NOT use any other port.`,
          `Use: browser_navigate url="http://localhost:${port}"`,
          `You can read the terminal output with: <read_terminal terminal_name="${terminalName}" />`,
        ].join('\n');
      } else {
        this.logToDebug(`Port ${port} did not respond after ${SERVER_BOOT_WAIT_MS}ms.`);
        return [
          `⚠️ Server launched but port ${port} is not responding yet after ${SERVER_BOOT_WAIT_MS / 1000}s.`,
          `Check terminal "${terminalName}" for errors.`,
          `You can read the terminal output with: <read_terminal terminal_name="${terminalName}" />`,
        ].join('\n');
      }
    }

    return `Server command launched in terminal "${terminalName}". No port detected — use <read_terminal terminal_name="${terminalName}" /> to check output, or browser_navigate to verify.`;
  }

  // -----------------------------------------------------------------------
  // Short (finite) commands — now also visible!
  // -----------------------------------------------------------------------

  private async executeShortCommand(cmd: string, cwd: string, originalCommand: string): Promise<string> {
    const terminalName = this.getTerminalName(originalCommand || cmd);

    // Create pseudoterminal and open/spawn it manually
    const pty = new MirrorPseudoterminal(cmd, cwd, terminalName);
    pty.open(undefined);
    this.activePtys.set(terminalName, pty);
    this.terminalCommandMap.set(terminalName, { command: cmd, isServer: false });
    this.logToDebug(`Started headless short terminal process "${terminalName}" (cwd: "${cwd}"): "${cmd}"`);

    // Race: wait for exit OR timeout OR inactivity/interactive prompt monitor
    const timeoutPromise = new Promise<'timeout'>((resolve) =>
      setTimeout(() => resolve('timeout'), SHORT_CMD_TIMEOUT_MS),
    );

    let lastOutputLength = 0;
    let inactiveTicks = 0;
    const intervalMs = 1000; // Check every 1 second
    const inactivityTimeoutSeconds = 15;
    const promptInactivityTimeoutSeconds = 4;
    let monitorInterval: NodeJS.Timeout | undefined;

    const monitorPromise = new Promise<'inactive' | 'prompt'>((resolve) => {
      monitorInterval = setInterval(() => {
        if (!pty.running) {
          if (monitorInterval) {
            clearInterval(monitorInterval);
          }
          return;
        }

        const currentOutput = pty.getFullOutput();
        const currentLength = currentOutput.length;

        if (currentLength === lastOutputLength) {
          inactiveTicks++;
        } else {
          inactiveTicks = 0;
          lastOutputLength = currentLength;
        }

        const trimmedOutput = currentOutput.trim();
        // Check if output ends in a standard prompt ending or confirmation query
        const endsWithPrompt = /([?:]\s*$)|(\[y\/n\]\s*$)|(\(y\/n\)\s*$)|(confirm\s*$)|(choice\s*$)/i.test(
          trimmedOutput,
        );

        if (endsWithPrompt && inactiveTicks >= promptInactivityTimeoutSeconds) {
          this.logToDebug(
            `Command in terminal "${terminalName}" appears to be hung waiting for input (prompt detected).`,
          );
          if (monitorInterval) {
            clearInterval(monitorInterval);
          }
          resolve('prompt');
        } else if (inactiveTicks >= inactivityTimeoutSeconds) {
          this.logToDebug(
            `Command in terminal "${terminalName}" has been inactive (no output) for ${inactivityTimeoutSeconds}s.`,
          );
          if (monitorInterval) {
            clearInterval(monitorInterval);
          }
          resolve('inactive');
        }
      }, intervalMs);
    });

    const result = await Promise.race([pty.exitPromise, timeoutPromise, monitorPromise]);

    if (monitorInterval) {
      clearInterval(monitorInterval);
    }

    if (result === 'timeout') {
      this.logToDebug(
        `Command in terminal "${terminalName}" timed out after ${SHORT_CMD_TIMEOUT_MS}ms, still running.`,
      );
      const partialOutput = pty.getRecentOutput(10000);
      return [
        `Command timed out after ${SHORT_CMD_TIMEOUT_MS / 1000}s and is still running in terminal "${terminalName}".`,
        ``,
        `Partial Output:`,
        partialOutput || '[No output yet]',
        ``,
        `You can read more output with: <read_terminal terminal_name="${terminalName}" />`,
      ].join('\n');
    }

    if (result === 'prompt') {
      this.logToDebug(`Command in terminal "${terminalName}" early resolved due to pending interactive prompt.`);
      const partialOutput = pty.getRecentOutput(10000);
      const lines = partialOutput.trim().split('\n');
      const lastFewLines = lines.slice(-5).join('\n');
      return [
        `⚠️ Command appears to be stalled waiting for user input or confirmation.`,
        ``,
        `Last output lines:`,
        lastFewLines || '[No output]',
        ``,
        `Use: <send_terminal_input terminal_name="${terminalName}">input_value</send_terminal_input> to submit the response, or <close_terminal terminal_name="${terminalName}" /> to terminate.`,
      ].join('\n');
    }

    if (result === 'inactive') {
      this.logToDebug(
        `Command in terminal "${terminalName}" early resolved due to ${inactivityTimeoutSeconds}s of silence.`,
      );
      const partialOutput = pty.getRecentOutput(10000);
      return [
        `⚠️ Command has been running but was inactive (produced no new output) for ${inactivityTimeoutSeconds} seconds.`,
        ``,
        `Recent Output:`,
        partialOutput || '[No output]',
        ``,
        `The command is still running in terminal "${terminalName}".`,
        `You can:`,
        `- Wait longer and read the output again: <read_terminal terminal_name="${terminalName}" />`,
        `- Send key input/signals (e.g. Ctrl+C): <send_terminal_input terminal_name="${terminalName}">Ctrl+C</send_terminal_input>`,
        `- Close/kill the terminal: <close_terminal terminal_name="${terminalName}" />`,
      ].join('\n');
    }

    // Process exited (result is from pty.exitPromise)
    const { code, output } = result;
    this.logToDebug(`Command in terminal "${terminalName}" exited with code ${code}`);

    if (code === 0 || code === null) {
      return output.trim() || 'Command completed with no output.';
    } else {
      throw new Error(`Command failed (exit code ${code}).\n\nOutput:\n${output.trim() || '[No output]'}`);
    }
  }

  // -----------------------------------------------------------------------
  // Terminal interaction tools
  // -----------------------------------------------------------------------

  /** Sends input text or keys (like Ctrl+C) to a specific active terminal. */
  public sendInputToTerminal(terminalName: string, input: string): boolean {
    // First check our pseudoterminals
    const pty = this.activePtys.get(terminalName);
    if (pty && pty.running) {
      this.logToDebug(`Sending input to pseudoterminal "${terminalName}": "${input}"`);
      if (input === 'Ctrl+C' || input === 'ctrl+c' || input === '\u0003') {
        pty.handleInput('\u0003');
      } else {
        pty.handleInput(input + '\n');
      }
      return true;
    }

    // Fuzzy match across our terminals using normalization
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .replace(/mirror:/i, '')
        .replace(/[^\w]/g, '');
    const normSearch = normalize(terminalName);
    if (normSearch) {
      for (const [name, p] of this.activePtys) {
        const normName = normalize(name);
        if ((normName.includes(normSearch) || normSearch.includes(normName)) && p.running) {
          this.logToDebug(`Sending input to fuzzy-matched pseudoterminal "${name}": "${input}"`);
          if (input === 'Ctrl+C' || input === 'ctrl+c' || input === '\u0003') {
            p.handleInput('\u0003');
          } else {
            p.handleInput(input + '\n');
          }
          return true;
        }
      }
    }

    // Fallback: try VS Code terminal API (for non-pty terminals)
    let terminal = this.activeTerminals.get(terminalName);
    if (!terminal) {
      terminal = vscode.window.terminals.find((t) => t.name === terminalName);
    }

    if (terminal) {
      this.logToDebug(`Sending input to terminal "${terminalName}" via sendText: "${input}"`);
      if (input === 'Ctrl+C' || input === 'ctrl+c' || input === '\u0003') {
        terminal.sendText('\u0003', false);
      } else {
        terminal.sendText(input, true);
      }
      return true;
    }
    return false;
  }

  /** Closes and disposes a specific active terminal process. */
  public closeTerminal(terminalName: string): boolean {
    let pty = this.activePtys.get(terminalName);
    let foundName = terminalName;

    // Fuzzy match using normalization
    if (!pty) {
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/mirror:/i, '')
          .replace(/[^\w]/g, '');
      const normSearch = normalize(terminalName);
      if (normSearch) {
        for (const [name, p] of this.activePtys) {
          const normName = normalize(name);
          if (normName.includes(normSearch) || normSearch.includes(normName)) {
            pty = p;
            foundName = name;
            break;
          }
        }
      }
    }

    if (pty) {
      this.logToDebug(`Closing terminal process "${foundName}"`);
      pty.close();
      this.activePtys.delete(foundName);
      this.terminalCommandMap.delete(foundName);
      return true;
    }
    return false;
  }

  /** Kills a background process by PID (legacy — kept for compatibility). */
  public killProcess(pid: number): boolean {
    // With pseudoterminals we don't track by PID anymore,
    // but keep this method for any external callers.
    this.logToDebug(`killProcess(${pid}) called — searching terminals...`);
    return false;
  }


  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Terminate all terminals and clean up on shutdown. */
  public cleanup() {
    this.logToDebug('Cleaning up all running terminals...');
    for (const [name, pty] of this.activePtys.entries()) {
      try {
        pty.close();
        this.logToDebug(`Disposed terminal process "${name}" during cleanup.`);
      } catch (e) {
        // ignore
      }
    }
    this.activePtys.clear();
    this.terminalCommandMap.clear();
  }

  // -----------------------------------------------------------------------
  // v2.0 — Anti-Zombie & BootstrapGraph Helpers
  // -----------------------------------------------------------------------

  /**
   * Terminate the full process tree for a named terminal.
   * Uses `taskkill /F /T` on Windows and `SIGKILL` on POSIX.
   * Compatible with the UncloggedCommandService interface from the v2 spec.
   *
   * @param terminalName  The terminal name as returned by `getActiveTerminals()`.
   * @returns true if a matching terminal was found and killed, false otherwise.
   */
  public async terminateActiveTree(terminalName: string): Promise<boolean> {
    const pty = this.activePtys.get(terminalName);
    if (!pty) return false;

    const pid = (pty as any).process?.pid as number | undefined;
    if (pid === undefined) {
      pty.close();
      this.activePtys.delete(terminalName);
      this.terminalCommandMap.delete(terminalName);
      return true;
    }

    return new Promise<boolean>((resolve) => {
      if (process.platform === 'win32') {
        child_process.exec(`taskkill /F /T /PID ${pid}`, () => {
          this.activePtys.delete(terminalName);
          this.terminalCommandMap.delete(terminalName);
          resolve(true);
        });
      } else {
        try {
          process.kill(-pid, 'SIGKILL');
        } catch {
          try { pty.close(); } catch { /* ignore */ }
        }
        this.activePtys.delete(terminalName);
        this.terminalCommandMap.delete(terminalName);
        resolve(true);
      }
    });
  }

  /**
   * Public wrapper around the private `probePort` for use by `BootstrapGraph`
   * and any external caller that needs a lightweight TCP LISTEN check.
   *
   * @param port       Port number to probe.
   * @param timeoutMs  Connection timeout in milliseconds (default 800).
   * @returns Promise<boolean> — true if something is listening on the port.
   */
  public static async probePortPublic(port: number, timeoutMs = 800): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const net = require('net') as typeof import('net');
    return new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => resolve(false));
      socket.connect(port, '127.0.0.1');
    });
  }
}

