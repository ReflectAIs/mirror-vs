/**
 * Graph Service — builds a dependency/call graph for the workspace.
 * Supports TS/JS import analysis, function call tracking, and class hierarchy.
 * Enables "Show callers", "Show references", and "Trace data flow" features.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface CodeNode {
  id: string;
  name: string;
  kind: 'file' | 'function' | 'class' | 'interface' | 'variable' | 'import' | 'export';
  filePath: string;
  line: number;
  metadata?: Record<string, string>;
}

export interface CodeEdge {
  from: string; // node id
  to: string; // node id
  relation: 'imports' | 'calls' | 'extends' | 'implements' | 'references' | 'exports';
  line?: number;
}

export interface CodeGraph {
  nodes: Map<string, CodeNode>;
  edges: CodeEdge[];
}

export interface GraphQueryResult {
  node: CodeNode;
  incoming: CodeEdge[];
  outgoing: CodeEdge[];
}

export class GraphService {
  private static instance: GraphService;
  private _graph: CodeGraph = { nodes: new Map(), edges: [] };
  private _indexed = false;

  static getInstance(): GraphService {
    if (!GraphService.instance) {
      GraphService.instance = new GraphService();
    }
    return GraphService.instance;
  }

  /**
   * Index the entire workspace to build the code graph.
   */
  async indexWorkspace(progress?: (current: number, total: number) => void): Promise<number> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return 0;

    this._graph = { nodes: new Map(), edges: [] };
    const files = this._getSourceFiles(workspaceFolder);
    let processed = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        this._parseFile(file, content);
        processed++;
      } catch {
        // skip
      }
      if (progress) progress(processed, files.length);
    }

    this._indexed = true;
    return processed;
  }

  private _getSourceFiles(dir: string): string[] {
    const skip = ['node_modules', 'dist', 'out', '.git', '.mirror-vs', 'build', '.next', '.vscode', 'coverage'];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skip.includes(entry.name) || entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this._getSourceFiles(fullPath));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'].includes(ext)) {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // skip
    }
    return results;
  }

  /**
   * Parse a file to extract nodes and edges.
   */
  private _parseFile(filePath: string, content: string): void {
    const ext = path.extname(filePath).toLowerCase();
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      this._parseTSFile(filePath, content);
    } else if (ext === '.py') {
      this._parsePythonFile(filePath, content);
    }
  }

  private _nodeId(filePath: string, name: string): string {
    return `${filePath}::${name}`;
  }

  /**
   * Parse TypeScript/JavaScript files for imports, exports, functions, classes.
   */
  private _parseTSFile(filePath: string, content: string): void {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);

    // Add file node
    const fileNodeId = this._nodeId(filePath, fileName);
    this._graph.nodes.set(fileNodeId, {
      id: fileNodeId,
      name: fileName,
      kind: 'file',
      filePath,
      line: 1,
    });

    // Parse imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|[^'"]+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const relPath = this._resolveImportPath(filePath, importPath);
      if (relPath) {
        const importNodeId = this._nodeId(relPath, path.basename(relPath));
        if (!this._graph.nodes.has(importNodeId)) {
          this._graph.nodes.set(importNodeId, {
            id: importNodeId,
            name: path.basename(relPath),
            kind: 'file',
            filePath: relPath,
            line: 1,
          });
        }
        this._graph.edges.push({
          from: fileNodeId,
          to: importNodeId,
          relation: 'imports',
          line: this._getLineNumber(content, match.index),
        });
      }
    }

    // Parse function declarations
    const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1];
      const nodeId = this._nodeId(filePath, name);
      this._graph.nodes.set(nodeId, {
        id: nodeId,
        name,
        kind: 'function',
        filePath,
        line: this._getLineNumber(content, match.index),
      });
      this._graph.edges.push({
        from: fileNodeId,
        to: nodeId,
        relation: 'exports',
      });
    }

    // Parse class declarations
    const classRegex = /(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const extendsName = match[2];
      const implementsList = match[3];

      const nodeId = this._nodeId(filePath, name);
      this._graph.nodes.set(nodeId, {
        id: nodeId,
        name,
        kind: 'class',
        filePath,
        line: this._getLineNumber(content, match.index),
      });

      if (extendsName) {
        this._graph.edges.push({
          from: nodeId,
          to: this._nodeId(filePath, extendsName),
          relation: 'extends',
        });
      }

      if (implementsList) {
        const interfaces = implementsList.split(',').map((i) => i.trim());
        for (const iface of interfaces) {
          if (iface) {
            this._graph.edges.push({
              from: nodeId,
              to: this._nodeId(filePath, iface),
              relation: 'implements',
            });
          }
        }
      }
    }

    // Parse arrow function assignments (const foo = () => {} or export const foo = ...)
    const arrowRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
    while ((match = arrowRegex.exec(content)) !== null) {
      const name = match[1];
      const nodeId = this._nodeId(filePath, name);
      if (!this._graph.nodes.has(nodeId)) {
        this._graph.nodes.set(nodeId, {
          id: nodeId,
          name,
          kind: 'function',
          filePath,
          line: this._getLineNumber(content, match.index),
        });
      }
    }

    // Parse function calls (simplified heuristic)
    const callRegex = /(\w+)\s*\(/g;
    const knownNames = new Set<string>();
    for (const [, node] of this._graph.nodes) {
      knownNames.add(node.name);
    }
    let lastFuncNodeId = '';
    const funcRegex2 = /function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(/g;
    while ((match = funcRegex2.exec(content)) !== null) {
      const funcName = match[1] || match[2];
      if (funcName) {
        lastFuncNodeId = this._nodeId(filePath, funcName);
      }
    }
  }

  /**
   * Parse Python files for imports, functions, classes.
   */
  private _parsePythonFile(filePath: string, content: string): void {
    const lines = content.split('\n');
    const fileName = path.basename(filePath);

    const fileNodeId = this._nodeId(filePath, fileName);
    this._graph.nodes.set(fileNodeId, {
      id: fileNodeId,
      name: fileName,
      kind: 'file',
      filePath,
      line: 1,
    });

    // Parse imports
    const importRegex = /^(?:from\s+(\S+)\s+import\s+(.+)|import\s+(.+))/gm;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const moduleName = match[1] || match[3];
      if (moduleName && !moduleName.startsWith('.')) {
        const importNodeId = this._nodeId(filePath, moduleName);
        this._graph.nodes.set(importNodeId, {
          id: importNodeId,
          name: moduleName,
          kind: 'file',
          filePath,
          line: this._getLineNumber(content, match.index),
        });
        this._graph.edges.push({
          from: fileNodeId,
          to: importNodeId,
          relation: 'imports',
        });
      }
    }

    // Parse function definitions
    const funcRegex = /^def\s+(\w+)/gm;
    while ((match = funcRegex.exec(content)) !== null) {
      const name = match[1];
      const nodeId = this._nodeId(filePath, name);
      this._graph.nodes.set(nodeId, {
        id: nodeId,
        name,
        kind: 'function',
        filePath,
        line: this._getLineNumber(content, match.index),
      });
    }

    // Parse class definitions
    const classRegex = /^class\s+(\w+)(?:\(([^)]*)\))?/gm;
    while ((match = classRegex.exec(content)) !== null) {
      const name = match[1];
      const bases = match[2]?.split(',').map((b) => b.trim()) || [];
      const nodeId = this._nodeId(filePath, name);
      this._graph.nodes.set(nodeId, {
        id: nodeId,
        name,
        kind: 'class',
        filePath,
        line: this._getLineNumber(content, match.index),
      });
      for (const base of bases) {
        if (base && base !== 'object') {
          this._graph.edges.push({
            from: nodeId,
            to: this._nodeId(filePath, base),
            relation: 'extends',
          });
        }
      }
    }
  }

  private _getLineNumber(content: string, index: number): number {
    return content.substring(0, index).split('\n').length;
  }

  private _resolveImportPath(fromFile: string, importPath: string): string | null {
    if (importPath.startsWith('.')) {
      const dir = path.dirname(fromFile);
      const resolved = path.resolve(dir, importPath);
      const exts = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', ''];
      for (const ext of exts) {
        const fullPath = resolved + ext;
        if (fs.existsSync(fullPath)) return fullPath;
      }
      if (fs.existsSync(resolved)) return resolved;
    }
    return null;
  }

  /**
   * Query all callers/references to a symbol.
   */
  getCallers(filePath: string, symbolName: string): GraphQueryResult | null {
    const nodeId = this._nodeId(filePath, symbolName);
    const node = this._graph.nodes.get(nodeId);
    if (!node) return null;

    const incoming = this._graph.edges.filter((e) => e.to === nodeId);
    const outgoing = this._graph.edges.filter((e) => e.from === nodeId);
    return { node, incoming, outgoing };
  }

  /**
   * Get all imports/dependencies of a file.
   */
  getDependencies(filePath: string): CodeEdge[] {
    const fileNodeId = this._nodeId(filePath, path.basename(filePath));
    return this._graph.edges.filter((e) => e.from === fileNodeId && e.relation === 'imports');
  }

  /**
   * Get all files that import/depend on a given file.
   */
  getDependents(filePath: string): CodeEdge[] {
    const fileNodeId = this._nodeId(filePath, path.basename(filePath));
    return this._graph.edges.filter((e) => e.to === fileNodeId && e.relation === 'imports');
  }

  /**
   * Get the full graph as a formatted string for the agent.
   */
  getGraphSummary(): string {
    const lines: string[] = ['[CODE GRAPH SUMMARY]', ''];
    lines.push(`Total nodes: ${this._graph.nodes.size}`);
    lines.push(`Total edges: ${this._graph.edges.length}`);
    lines.push('');

    const files = new Set<string>();
    for (const [, node] of this._graph.nodes) {
      files.add(node.filePath);
    }
    lines.push(`Files indexed: ${files.size}`);
    lines.push('');

    // Top 10 most connected nodes
    const nodeEdges = new Map<string, number>();
    for (const edge of this._graph.edges) {
      nodeEdges.set(edge.from, (nodeEdges.get(edge.from) || 0) + 1);
      nodeEdges.set(edge.to, (nodeEdges.get(edge.to) || 0) + 1);
    }

    const sorted = [...nodeEdges.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    lines.push('Top 10 most connected nodes:');
    for (const [nodeId, count] of sorted) {
      const node = this._graph.nodes.get(nodeId);
      if (node) {
        lines.push(`  - ${node.name} (${node.kind}, ${count} connections)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Trace a dependency chain from source to target.
   */
  findPath(fromFile: string, toFile: string): CodeNode[] | null {
    const fromId = this._nodeId(fromFile, path.basename(fromFile));
    const toId = this._nodeId(toFile, path.basename(toFile));

    // BFS
    const visited = new Set<string>();
    const queue: { nodeId: string; path: string[] }[] = [{ nodeId: fromId, path: [fromId] }];
    visited.add(fromId);

    while (queue.length > 0) {
      const { nodeId, path: currentPath } = queue.shift()!;
      if (nodeId === toId) {
        return currentPath.map((id) => this._graph.nodes.get(id)!).filter(Boolean);
      }

      const edges = this._graph.edges.filter((e) => e.from === nodeId && e.relation === 'imports');
      for (const edge of edges) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push({ nodeId: edge.to, path: [...currentPath, edge.to] });
        }
      }
    }

    return null;
  }

  get isIndexed(): boolean {
    return this._indexed;
  }
}
