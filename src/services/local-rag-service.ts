import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RagChunk {
  filePath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
}

export class LocalRagService {
  private static instance: LocalRagService;
  private chunks: RagChunk[] = [];
  private idf: Record<string, number> = {};
  private docVectors: Record<string, Record<string, number>> = {};
  private isIndexed = false;
  private isIndexing = false;

  public static getInstance(): LocalRagService {
    if (!LocalRagService.instance) {
      LocalRagService.instance = new LocalRagService();
    }
    return LocalRagService.instance;
  }

  // Load index from workspace if exists
  public async loadIndex(): Promise<boolean> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return false;

    const indexPath = path.join(workspaceRoot, '.mirror-vs', 'rag_index.json');
    if (fs.existsSync(indexPath)) {
      try {
        const raw = fs.readFileSync(indexPath, 'utf8');
        const data = JSON.parse(raw);
        this.chunks = data.chunks || [];
        this.idf = data.idf || {};
        this.docVectors = data.docVectors || {};
        this.isIndexed = true;
        return true;
      } catch (e) {
        console.error('Failed to load RAG index:', e);
      }
    }
    return false;
  }

  // Save index to workspace
  private async saveIndex(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) return;

    const indexDir = path.join(workspaceRoot, '.mirror-vs');
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }

    const indexPath = path.join(indexDir, 'rag_index.json');
    try {
      const data = {
        chunks: this.chunks,
        idf: this.idf,
        docVectors: this.docVectors,
      };
      fs.writeFileSync(indexPath, JSON.stringify(data), 'utf8');
    } catch (e) {
      console.error('Failed to save RAG index:', e);
    }
  }

  // Tokenize string into terms
  private tokenize(text: string): string[] {
    // Split by non-word characters and camelCase boundaries
    const words = text
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // split camelCase
      .toLowerCase()
      .split(/[^a-zA-Z0-9_]+/)
      .filter((w) => w.length > 1 && w.length < 30);
    return words;
  }

  // Index the workspace in the background
  public async indexWorkspace(force = false): Promise<void> {
    if (this.isIndexing) return;
    if (this.isIndexed && !force) return;

    this.isIndexing = true;
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.isIndexing = false;
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    vscode.window.setStatusBarMessage('$(sync~spin) Mirror VS: Indexing workspace for Local RAG...', 3000);

    try {
      // Find all files
      const files = await vscode.workspace.findFiles(
        '**/*',
        '{**/node_modules/**,**/dist/**,**/out/**,**/.git/**,**/.mirror-vs/**,**/bin/**,**/obj/**,**/build/**,**/.next/**,**/coverage/**,**/*.png,**/*.jpg,**/*.jpeg,**/*.gif,**/*.ico,**/*.svg,**/*.pdf,**/*.zip,**/*.exe,**/*.dll,**/*.vsix}',
      );

      const newChunks: RagChunk[] = [];

      let fileCount = 0;
      for (const file of files) {
        fileCount++;
        if (fileCount % 30 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        try {
          const stats = fs.statSync(file.fsPath);
          if (stats.size > 200000) {
            continue; // Skip files > 200KB
          }
          const content = fs.readFileSync(file.fsPath, 'utf8');
          if (!content.trim()) continue;

          const relPath = path.relative(workspaceRoot, file.fsPath).replace(/\\/g, '/');

          // Split file into chunks of approx 1000 chars (with lines)
          const lines = content.split('\n');
          let currentChunkLines: string[] = [];
          let currentStartLine = 1;
          let currentLength = 0;

          for (let i = 0; i < lines.length; i++) {
            currentChunkLines.push(lines[i]);
            currentLength += lines[i].length + 1;

            if (currentLength >= 1000 || i === lines.length - 1) {
              newChunks.push({
                filePath: relPath,
                chunkIndex: newChunks.length,
                startLine: currentStartLine,
                endLine: i + 1,
                content: currentChunkLines.join('\n'),
              });

              // Keep a 4-line overlap for context continuity
              const overlapCount = Math.min(4, currentChunkLines.length);
              currentChunkLines = currentChunkLines.slice(currentChunkLines.length - overlapCount);
              currentStartLine = i + 1 - overlapCount + 1;
              currentLength = currentChunkLines.reduce((sum, l) => sum + l.length + 1, 0);
            }
          }
        } catch (e) {
          // Skip reading failures
        }
      }

      this.chunks = newChunks;

      // Compute TF-IDF
      const docCount = this.chunks.length;
      if (docCount === 0) {
        this.isIndexed = true;
        this.isIndexing = false;
        return;
      }

      const docTermFreqs: Record<string, Record<string, number>> = {};
      const termDocCounts: Record<string, number> = {};

      for (const chunk of this.chunks) {
        const docId = chunk.chunkIndex.toString();
        const tokens = this.tokenize(chunk.content);

        const freqs: Record<string, number> = {};
        for (const token of tokens) {
          freqs[token] = (freqs[token] || 0) + 1;
        }

        docTermFreqs[docId] = freqs;

        for (const term in freqs) {
          termDocCounts[term] = (termDocCounts[term] || 0) + 1;
        }
      }

      // Compute IDF
      const newIdf: Record<string, number> = {};
      for (const term in termDocCounts) {
        newIdf[term] = Math.log(1 + (docCount - termDocCounts[term] + 0.5) / (termDocCounts[term] + 0.5));
      }
      this.idf = newIdf;

      // Compute doc vectors (TF-IDF)
      const newDocVectors: Record<string, Record<string, number>> = {};
      for (const chunk of this.chunks) {
        const docId = chunk.chunkIndex.toString();
        const freqs = docTermFreqs[docId];
        const vector: Record<string, number> = {};
        let length = 0;

        for (const term in freqs) {
          const tfidf = freqs[term] * (this.idf[term] || 0);
          vector[term] = tfidf;
          length += tfidf * tfidf;
        }

        // L2 normalization
        const norm = Math.sqrt(length);
        if (norm > 0) {
          for (const term in vector) {
            vector[term] /= norm;
          }
        }

        newDocVectors[docId] = vector;
      }

      this.docVectors = newDocVectors;
      this.isIndexed = true;
      await this.saveIndex();

      vscode.window.setStatusBarMessage('✅ Mirror VS: Workspace indexed for semantic search.', 4000);
    } catch (e: any) {
      console.error('Indexing failed:', e);
    } finally {
      this.isIndexing = false;
    }
  }

  // Search RAG index
  public search(query: string, limit = 5): RagChunk[] {
    if (!this.isIndexed || this.chunks.length === 0) {
      return [];
    }

    const queryTokens = this.tokenize(query);
    const queryFreqs: Record<string, number> = {};
    for (const token of queryTokens) {
      queryFreqs[token] = (queryFreqs[token] || 0) + 1;
    }

    const queryVector: Record<string, number> = {};
    let queryLength = 0;

    for (const term in queryFreqs) {
      const tfidf = queryFreqs[term] * (this.idf[term] || 0);
      queryVector[term] = tfidf;
      queryLength += tfidf * tfidf;
    }

    const queryNorm = Math.sqrt(queryLength);
    if (queryNorm > 0) {
      for (const term in queryVector) {
        queryVector[term] /= queryNorm;
      }
    }

    // Cosine similarity
    const scores: { chunk: RagChunk; score: number }[] = [];
    for (const chunk of this.chunks) {
      const docId = chunk.chunkIndex.toString();
      const docVector = this.docVectors[docId];
      if (!docVector) continue;

      let score = 0;
      for (const term in queryVector) {
        if (docVector[term]) {
          score += queryVector[term] * docVector[term];
        }
      }

      if (score > 0) {
        scores.push({ chunk, score });
      }
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map((s) => s.chunk);
  }
}
