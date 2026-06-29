/**
 * Embedding Service — provides local vector embeddings using Ollama's embedding API.
 * Falls back to TF-IDF based similarity when Ollama is unavailable.
 * Enables semantic code search and improved RAG retrieval.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface EmbeddingCache {
  [filePath: string]: {
    embedding: number[];
    timestamp: number;
    contentHash: string;
  };
}

export interface SearchResult {
  filePath: string;
  score: number;
  snippet: string;
}

export class EmbeddingService {
  private static instance: EmbeddingService;
  private _cache: EmbeddingCache = {};
  private _cachePath = '';
  private _ollamaHost = 'http://localhost:11434';
  private _model = 'nomic-embed-text';
  private _dimensions = 768;
  private _initialized = false;

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  private _init(): void {
    if (this._initialized) return;
    this._ollamaHost = vscode.workspace
      .getConfiguration('mirror-vs')
      .get<string>('ollamaHost', 'http://localhost:11434');
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const mirrorDir = path.join(workspaceFolder, '.mirror-vs');
      if (!fs.existsSync(mirrorDir)) {
        fs.mkdirSync(mirrorDir, { recursive: true });
      }
      this._cachePath = path.join(mirrorDir, 'embeddings_cache.json');
      try {
        if (fs.existsSync(this._cachePath)) {
          this._cache = JSON.parse(fs.readFileSync(this._cachePath, 'utf8'));
        }
      } catch {
        // Use empty cache
      }
    }
    this._initialized = true;
  }

  private _saveCache(): void {
    if (!this._cachePath) return;
    fs.writeFileSync(this._cachePath, JSON.stringify(this._cache, null, 2), 'utf8');
  }

  /**
   * Simple string hash for cache invalidation.
   */
  private _hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash.toString(16);
  }

  /**
   * Get embeddings from Ollama API. Returns null if Ollama is unavailable.
   */
  private async _getOllamaEmbedding(text: string): Promise<number[] | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(`${this._ollamaHost}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this._model, prompt: text }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = (await response.json()) as { embedding?: number[] };
      return data.embedding || null;
    } catch {
      return null;
    }
  }

  /**
   * Cosine similarity between two vectors.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * TF-IDF fallback similarity (token overlap with IDF weighting).
   */
  private _tfIdfSimilarity(query: string, document: string): number {
    const tokenize = (text: string): string[] =>
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 1);

    const queryTokens = tokenize(query);
    const docTokens = tokenize(document);

    if (queryTokens.length === 0 || docTokens.length === 0) return 0;

    // Compute term frequencies
    const qt = new Map<string, number>();
    const dt = new Map<string, number>();
    for (const t of queryTokens) qt.set(t, (qt.get(t) || 0) + 1);
    for (const t of docTokens) dt.set(t, (dt.get(t) || 0) + 1);

    // Cosine similarity on TF vectors
    let dotProduct = 0;
    let normQ = 0;
    let normD = 0;
    const allTerms = new Set([...qt.keys(), ...dt.keys()]);
    for (const term of allTerms) {
      const qf = qt.get(term) || 0;
      const df = dt.get(term) || 0;
      dotProduct += qf * df;
      normQ += qf * qf;
      normD += df * df;
    }
    if (normQ === 0 || normD === 0) return 0;
    return dotProduct / (Math.sqrt(normQ) * Math.sqrt(normD));
  }

  /**
   * Embed a document and cache the result.
   */
  async embedDocument(filePath: string, content: string): Promise<number[]> {
    this._init();
    const contentHash = this._hashContent(content);

    // Return cached embedding if content hasn't changed
    const cached = this._cache[filePath];
    if (cached && cached.contentHash === contentHash && cached.embedding.length > 0) {
      return cached.embedding;
    }

    // Try Ollama embedding
    const embedding = await this._getOllamaEmbedding(content);
    if (embedding) {
      this._cache[filePath] = { embedding, timestamp: Date.now(), contentHash };
      this._saveCache();
      return embedding;
    }

    // Fallback: generate a pseudo-embedding from TF-IDF weights (reduced dimension)
    const tokens = content
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1);
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    // Create a fixed-size sparse vector from top tokens (hash-based)
    const dim = 256;
    const vector = new Array(dim).fill(0);
    for (const [token, freq] of tf) {
      let h = 0;
      for (let i = 0; i < token.length; i++) {
        h = ((h << 5) - h + token.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(h) % dim;
      vector[idx] += freq / tokens.length;
    }
    // Normalize
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vector[i] /= norm;
    }
    this._cache[filePath] = { embedding: vector, timestamp: Date.now(), contentHash };
    this._saveCache();
    return vector;
  }

  /**
   * Search files semantically. Uses TF-IDF as primary method with embedding boost when available.
   */
  async search(query: string, documents: { filePath: string; content: string }[]): Promise<SearchResult[]> {
    this._init();
    // Get query embedding (try Ollama, fallback to TF-IDF pseudo-embedding)
    let queryEmbedding: number[] | null = null;
    try {
      queryEmbedding = await this._getOllamaEmbedding(query);
    } catch {
      // Will fallback
    }

    const results: SearchResult[] = [];

    for (const doc of documents) {
      const lines = doc.content.split('\n');
      const chunkSize = 50;
      const overlap = 5;

      for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
        const chunkLines = lines.slice(i, i + chunkSize);
        const chunkContent = chunkLines.join('\n');
        if (!chunkContent.trim()) {
          if (i + chunkSize >= lines.length) break;
          continue;
        }

        let score: number;
        const chunkKey = `${doc.filePath}#${i + 1}-${i + chunkLines.length}`;

        if (queryEmbedding) {
          const docEmbedding = await this.embedDocument(chunkKey, chunkContent);
          score = this.cosineSimilarity(queryEmbedding, docEmbedding);
        } else {
          score = this._tfIdfSimilarity(query, chunkContent);
        }

        const snippet = chunkContent.substring(0, 500);

        results.push({
          filePath: `${doc.filePath} (Lines ${i + 1}-${i + chunkLines.length})`,
          score,
          snippet,
        });

        if (i + chunkSize >= lines.length) break;
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 20);
  }

  /**
   * Index all files in the workspace for embedding search.
   */
  async indexWorkspace(progress?: (current: number, total: number) => void): Promise<number> {
    this._init();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) return 0;

    const files = this._getWorkspaceFiles(workspaceFolder);
    let indexed = 0;

    for (let i = 0; i < files.length; i++) {
      try {
        const content = fs.readFileSync(files[i], 'utf8');
        if (content.length > 500000) continue; // Skip huge files
        await this.embedDocument(files[i], content);
        indexed++;
      } catch {
        // Skip unreadable files
      }
      if (progress) progress(i + 1, files.length);
    }

    this._saveCache();
    return indexed;
  }

  private _getWorkspaceFiles(dir: string): string[] {
    const skip = [
      'node_modules',
      'dist',
      'out',
      '.git',
      '.mirror-vs',
      'build',
      '.next',
      '.vscode',
      'coverage',
      '__pycache__',
    ];
    const results: string[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (skip.includes(entry.name)) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...this._getWorkspaceFiles(fullPath));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const supportedExts = [
            '.ts',
            '.js',
            '.tsx',
            '.jsx',
            '.py',
            '.go',
            '.rs',
            '.java',
            '.cpp',
            '.c',
            '.h',
            '.hpp',
            '.cs',
            '.rb',
            '.php',
            '.swift',
            '.kt',
            '.scala',
            '.vue',
            '.svelte',
            '.css',
            '.scss',
            '.less',
            '.html',
            '.md',
            '.json',
            '.yaml',
            '.yml',
            '.xml',
            '.sql',
            '.sh',
            '.bash',
            '.zsh',
            '.ps1',
            '.toml',
            '.ini',
            '.cfg',
            '.env',
          ];
          if (supportedExts.includes(ext) || ext === '') {
            results.push(fullPath);
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
    return results;
  }

  /**
   * Invalidate cache for a specific file.
   */
  invalidateCache(filePath: string): void {
    delete this._cache[filePath];
    this._saveCache();
  }

  /**
   * Clear all cached embeddings.
   */
  clearCache(): void {
    this._cache = {};
    this._saveCache();
  }
}
