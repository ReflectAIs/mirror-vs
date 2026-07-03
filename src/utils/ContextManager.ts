/**
 * Mirror VS v2.0 — ScoredPageCache (ContextManager)
 *
 * A priority-scored page-eviction cache for file-content read operations.
 * Replaces simple rolling arrays with a programmatic priority model:
 *
 *   Score 100  — Active target file (pinned for current edit turn)
 *   Score  60  — Anchor documents: package.json, memory.md, tsconfig.json
 *   Score 0-75 — All other pages; decayed by 25 points per non-access turn
 *
 * Eviction runs SYNCHRONOUSLY (Q3: Option A) after every cache mutation.
 * When the aggregate token ceiling is breached, the lowest-scoring
 * non-pinned pages are evicted until the cache fits within budget.
 *
 * This is a COMPLEMENT to (not a replacement for):
 *   - ContextStore    (runtime/context-store.ts)  — agent decision items
 *   - evictStaleToolResults (tool-result-eviction.ts) — LLM message tokens
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachePage {
  /** Absolute file path or a unique transaction hash */
  id: string;
  /** The file content or serialised payload */
  payload: string;
  /** Estimated token count (use ~4 chars/token heuristic) */
  estimatedTokens: number;
  /**
   * Priority score in range [0, 100].
   * 100 = pinned (current active target)
   * ≥60 = anchor (core project docs)
   *  <60 = regular, subject to decay and eviction
   */
  priorityScore: number;
}

/** Files that should never drop below the anchor score floor */
const ANCHOR_SUFFIXES = ['package.json', 'tsconfig.json', 'memory.md', '.gitignore'];

// ---------------------------------------------------------------------------
// ScoredPageCache
// ---------------------------------------------------------------------------

export class ScoredPageCache {
  private readonly _store: Map<string, CachePage> = new Map();
  private readonly _tokenCeiling: number;

  /**
   * @param tokenCeiling Maximum total estimated tokens across all pages.
   *   Default 12 000 tokens (~48 KB of source text).
   */
  constructor(tokenCeiling = 12_000) {
    this._tokenCeiling = tokenCeiling;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Insert or overwrite a page in the cache, then enforce eviction.
   * Runs synchronously — no async needed for in-memory operations.
   */
  public push(id: string, payload: string, baseScore: number): void {
    const estimatedTokens = Math.ceil(payload.length / 4);
    this._store.set(id, { id, payload, estimatedTokens, priorityScore: baseScore });
    this._enforceSyncEviction();
  }

  /**
   * Retrieve a page by ID, or undefined if it has been evicted.
   */
  public get(id: string): CachePage | undefined {
    return this._store.get(id);
  }

  /**
   * Check if a page is present in the cache.
   */
  public has(id: string): boolean {
    return this._store.has(id);
  }

  /**
   * Pin the active file target at score 100 and decay all other pages.
   * Call this once per tool-call turn after determining the target file.
   *
   * Decay model:
   *   - Active target: score → 100 (pinned)
   *   - Anchor files:  score → max(current, 60) (soft floor)
   *   - All others:    score → max(0, score − 25)
   *
   * After decay, synchronous eviction is enforced.
   */
  public decayAndPin(activeFileId: string): void {
    for (const [id, page] of this._store.entries()) {
      if (id === activeFileId) {
        page.priorityScore = 100;
      } else if (this._isAnchor(id)) {
        page.priorityScore = Math.max(page.priorityScore, 60);
      } else {
        page.priorityScore = Math.max(0, page.priorityScore - 25);
      }
    }
    this._enforceSyncEviction();
  }

  /**
   * Reset a file's score to 0 (e.g. after it has been successfully patched
   * and is no longer the active read target).
   */
  public demote(id: string): void {
    const page = this._store.get(id);
    if (page) {
      page.priorityScore = 0;
      this._enforceSyncEviction();
    }
  }

  /**
   * Build a prompt-ready transcript of all cached pages, highest priority first.
   */
  public compileTranscript(): string {
    return Array.from(this._store.values())
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .map((p) => `[Context ID: ${p.id}]\n${p.payload}\n[End Context]`)
      .join('\n\n');
  }

  /**
   * Returns total estimated tokens currently in the cache.
   */
  public get totalTokens(): number {
    let sum = 0;
    for (const p of this._store.values()) sum += p.estimatedTokens;
    return sum;
  }

  /**
   * Returns the number of pages currently in the cache.
   */
  public get size(): number {
    return this._store.size;
  }

  /**
   * Remove all pages from the cache.
   */
  public clear(): void {
    this._store.clear();
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Synchronous eviction: sort non-pinned pages by ascending score,
   * evict lowest-scoring pages until total tokens fit within the ceiling.
   */
  private _enforceSyncEviction(): void {
    if (this.totalTokens <= this._tokenCeiling) return;

    // Build eviction candidates: excludes pages pinned at 100
    const candidates = Array.from(this._store.values())
      .filter((p) => p.priorityScore < 100)
      .sort((a, b) => a.priorityScore - b.priorityScore); // ascending: lowest first

    for (const page of candidates) {
      if (this.totalTokens <= this._tokenCeiling) break;
      this._store.delete(page.id);
    }
  }

  /** Returns true if the page ID matches one of the known anchor suffixes */
  private _isAnchor(id: string): boolean {
    return ANCHOR_SUFFIXES.some((suffix) => id.endsWith(suffix));
  }
}
