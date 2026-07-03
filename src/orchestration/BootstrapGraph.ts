/**
 * Mirror VS v2.0 — BootstrapGraph
 *
 * A 7-stage automated environment discoverer that runs before the first LLM
 * turn in a new session. Eliminates the "Verification Anxiety" loop where
 * models recursively call list_dir / read_file just to orient themselves.
 *
 * Stages:
 *   1. PREFETCH        — Load project memory from .mirror-vs/memory.md
 *   2. WORKSPACE_SCAN  — Build a depth-capped file tree
 *   3. TECH_DISCOVERY  — Identify tech stack from marker files
 *   4. PORT_PROBE      — Check for running dev-server ports (anti-zombie)
 *   5. SNAPSHOT_LOAD   — Fetch active LSP diagnostics
 *   6. PARADIGM_BIND   — Resolve dynamic constraints (future: plugin hooks)
 *   7. ROUTE_INIT      — Signal readiness to IntentRouter
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BootstrapPayload {
  /** Contents of .mirror-vs/memory.md (empty string if not present) */
  projectMemory: string;
  /**
   * Flat list of workspace-relative paths (depth ≤ depthCeiling).
   * Directories are represented with a trailing slash.
   */
  workspaceTree: string[];
  /** Detected tech stack identifiers (e.g. "TypeScript", "Vite_Bundler") */
  techStack: string[];
  /** TCP ports that are currently LISTEN-ing (subset of PROBE_PORTS) */
  activePorts: number[];
  /** All active LSP error-severity diagnostics at discovery time */
  diagnosticsSnapshot: vscode.Diagnostic[];
}

/** Ports probed during stage 4 (PORT_PROBE) */
const PROBE_PORTS = [3000, 3001, 4000, 5173, 8080, 8000];

/** Directories excluded from the workspace tree scan */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  '.vscode',
  '.mirror-vs',
  '.next',
  '__pycache__',
]);

/** File markers mapped to their tech-stack label */
const TECH_MARKERS: Record<string, string> = {
  'package.json':      'NodeJS/Ecosystem',
  'tsconfig.json':     'TypeScript',
  'vite.config.ts':    'Vite_Bundler',
  'vite.config.js':    'Vite_Bundler',
  'webpack.config.js': 'Webpack',
  'next.config.js':    'NextJS',
  'next.config.ts':    'NextJS',
  'requirements.txt':  'Python_Pip',
  'pyproject.toml':    'Python_Poetry',
  'cargo.toml':        'Rust_Cargo',
  'go.mod':            'Go_Modules',
  'Dockerfile':        'Docker',
  'docker-compose.yml':'Docker_Compose',
};

// ---------------------------------------------------------------------------
// BootstrapGraph class
// ---------------------------------------------------------------------------

export class BootstrapGraph {
  private readonly lifecycleStages = [
    'PREFETCH',
    'WORKSPACE_SCAN',
    'TECH_DISCOVERY',
    'PORT_PROBE',
    'SNAPSHOT_LOAD',
    'PARADIGM_BIND',
    'ROUTE_INIT',
  ] as const;

  /**
   * Run all 7 discovery stages and return the consolidated payload.
   * @param rootPath Absolute path to the workspace root.
   * @param depthCeiling Maximum directory depth to scan (default 3).
   */
  public async runDiscovery(rootPath: string, depthCeiling = 3): Promise<BootstrapPayload> {
    const payload: Partial<BootstrapPayload> = {};

    // Stage 1 (PREFETCH) + Stage 5 (SNAPSHOT_LOAD) run first so errors
    // surface early; the remaining stages are independent.
    payload.projectMemory = await this._readProjectMemory(rootPath);

    // Stage 2: Workspace Map Assembly
    payload.workspaceTree = await this._generateWorkspaceTree(rootPath, depthCeiling);

    // Stage 3: Technical Paradigm Resolution
    payload.techStack = this._identifyTechStack(rootPath);

    // Stage 4: Network Listener Probing (Anti-Zombie Check)
    payload.activePorts = await this._probeTargetPorts(PROBE_PORTS);

    // Stage 5: LSP Diagnostics Snapshot
    payload.diagnosticsSnapshot = this._fetchActiveDiagnostics();

    // Stages 6 & 7 are structural markers; no runtime work needed at launch.

    return payload as BootstrapPayload;
  }

  /**
   * Serialise the bootstrap payload into a compact system-prompt block.
   * Injected by orchestrator-prompt.ts before the first model turn.
   */
  public static formatPayloadForPrompt(payload: BootstrapPayload): string {
    const lines: string[] = [];

    lines.push('### 🚀 Bootstrap Environment Snapshot');

    // Project memory
    if (payload.projectMemory) {
      lines.push('\n**Project Memory (.mirror-vs/memory.md):**');
      lines.push('```');
      lines.push(payload.projectMemory.slice(0, 2000)); // cap at 2K chars
      lines.push('```');
    }

    // Tech stack
    if (payload.techStack.length > 0) {
      lines.push(`\n**Detected Tech Stack:** ${payload.techStack.join(', ')}`);
    }

    // Active ports
    if (payload.activePorts.length > 0) {
      lines.push(`\n**Active Dev-Server Ports:** ${payload.activePorts.join(', ')}`);
    } else {
      lines.push('\n**Active Dev-Server Ports:** None detected');
    }

    // Workspace tree (first 100 entries to avoid flooding the prompt)
    if (payload.workspaceTree.length > 0) {
      const treePreview = payload.workspaceTree.slice(0, 100);
      lines.push('\n**Workspace Tree (depth 3, truncated at 100 entries):**');
      lines.push('```');
      lines.push(treePreview.join('\n'));
      if (payload.workspaceTree.length > 100) {
        lines.push(`... and ${payload.workspaceTree.length - 100} more entries`);
      }
      lines.push('```');
    }

    // Diagnostics
    if (payload.diagnosticsSnapshot.length > 0) {
      lines.push(`\n**LSP Errors at Session Start:** ${payload.diagnosticsSnapshot.length} error(s) detected`);
      const top5 = payload.diagnosticsSnapshot.slice(0, 5);
      for (const d of top5) {
        lines.push(`  - [Line ${d.range.start.line + 1}] ${d.message}`);
      }
    } else {
      lines.push('\n**LSP Errors at Session Start:** ✅ Zero errors');
    }

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Stage implementations
  // -------------------------------------------------------------------------

  /** Stage 1 — PREFETCH: Load persisted project memory */
  private async _readProjectMemory(root: string): Promise<string> {
    const memoryPath = path.join(root, '.mirror-vs', 'memory.md');
    try {
      return await fs.promises.readFile(memoryPath, 'utf8');
    } catch {
      return '';
    }
  }

  /** Stage 2 — WORKSPACE_SCAN: Recursive depth-capped directory walk */
  private async _generateWorkspaceTree(
    dir: string,
    depthCeiling: number,
    prefix = '',
  ): Promise<string[]> {
    if (depthCeiling === 0) return [];
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const discovered: string[] = [];

      for (const entry of entries) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          discovered.push(`${relativePath}/`);
          const nested = await this._generateWorkspaceTree(
            path.join(dir, entry.name),
            depthCeiling - 1,
            relativePath,
          );
          discovered.push(...nested);
        } else {
          discovered.push(relativePath);
        }
      }
      return discovered;
    } catch {
      return [];
    }
  }

  /** Stage 3 — TECH_DISCOVERY: Check for well-known project marker files */
  private _identifyTechStack(root: string): string[] {
    const detected: string[] = [];
    const seen = new Set<string>(); // deduplicate (e.g. two vite.config variants)
    for (const [file, label] of Object.entries(TECH_MARKERS)) {
      if (!seen.has(label) && fs.existsSync(path.join(root, file))) {
        detected.push(label);
        seen.add(label);
      }
    }
    return detected;
  }

  /** Stage 4 — PORT_PROBE: Low-overhead TCP connection check */
  private async _probeTargetPorts(ports: number[]): Promise<number[]> {
    const checks = ports.map((port) => this._probePort(port));
    const results = await Promise.all(checks);
    return ports.filter((_, i) => results[i]);
  }

  /**
   * Attempt a TCP connection to 127.0.0.1:port.
   * Returns true if something is listening, false otherwise.
   */
  private _probePort(port: number, timeoutMs = 800): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('timeout', () => { socket.destroy(); resolve(false); });
      socket.once('error', () => resolve(false));
      socket.connect(port, '127.0.0.1');
    });
  }

  /** Stage 5 — SNAPSHOT_LOAD: Collect all current LSP error diagnostics */
  private _fetchActiveDiagnostics(): vscode.Diagnostic[] {
    const errors: vscode.Diagnostic[] = [];
    try {
      vscode.languages.getDiagnostics().forEach(([, diagnostics]) => {
        errors.push(...diagnostics.filter(
          (d) => d.severity === vscode.DiagnosticSeverity.Error,
        ));
      });
    } catch {
      // Silently fail in test environments where vscode API is unavailable
    }
    return errors;
  }
}
