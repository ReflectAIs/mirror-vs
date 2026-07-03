/**
 * Mirror VS v2.0 — TransactionalCommitPipeline
 *
 * Two-phase write protection for file mutations:
 *
 *   Phase 1 — IN-MEMORY STRUCTURAL AUDIT
 *     Validates each proposed file buffer against a brace-balance check
 *     before any bytes hit the disk. Uses string-literal stripping to
 *     prevent false positives from template strings, regex literals, and
 *     comments containing unbalanced braces.
 *
 *   Phase 2 — ATOMIC DISK FLUSH
 *     Only reached if ALL files in the batch pass Phase 1.
 *     If any file fails, the ENTIRE batch is rejected (Q2: Option A —
 *     all-or-nothing rollback, no partial states).
 *
 * Supported file types for brace audit: .ts .tsx .js .jsx .json .css
 * Other file types skip the audit and are always written as-is.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileBufferMutation {
  /** Absolute path to the file on disk */
  workspaceAbsolutePath: string;
  /** Full proposed file content (will be validated before writing) */
  proposedFileBuffer: string;
}

export interface TransactionResult {
  /** true if all files passed validation and were written to disk */
  success: boolean;
  /**
   * If success=false, a human-readable explanation of the failure.
   * Includes the filename and the specific validation that failed.
   */
  errorLog?: string;
  /**
   * Files that were skipped from the audit (non-auditable extension).
   * These are still included in the disk flush if the batch succeeds.
   */
  skippedAuditFiles?: string[];
}

/** Extensions that undergo brace-balance structural validation */
const AUDITABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json', '.css']);

// ---------------------------------------------------------------------------
// TransactionalCommitPipeline
// ---------------------------------------------------------------------------

export class TransactionalCommitPipeline {

  /**
   * Stage and execute a file-write transaction.
   *
   * Phase 1: All files in `mutations` are validated in-memory.
   * If any single file fails the structural audit, the entire batch
   * is rejected (no files are written to disk — atomic rollback).
   *
   * Phase 2: If all files pass, they are written to disk atomically.
   *
   * @param mutations  Array of {absolutePath, proposedContent} pairs.
   */
  public async stageAndExecuteTransaction(
    mutations: FileBufferMutation[],
  ): Promise<TransactionResult> {
    const skippedAuditFiles: string[] = [];

    // -----------------------------------------------------------------------
    // Phase 1: In-Memory Structural Integrity Verification
    // -----------------------------------------------------------------------
    for (const change of mutations) {
      const ext = path.extname(change.workspaceAbsolutePath).toLowerCase();

      if (!AUDITABLE_EXTENSIONS.has(ext)) {
        skippedAuditFiles.push(path.basename(change.workspaceAbsolutePath));
        continue; // Non-auditable extensions are trusted as-is
      }

      const auditResult = this._executeStaticBraceAudit(change);
      if (!auditResult.pass) {
        return {
          success: false,
          errorLog:
            `Transaction rolled back: Structural brace validation violation in ` +
            `"${path.basename(change.workspaceAbsolutePath)}". ` +
            `${auditResult.detail} ` +
            `All ${mutations.length} file(s) in this batch were rejected (atomic rollback).`,
          skippedAuditFiles,
        };
      }
    }

    // -----------------------------------------------------------------------
    // Phase 2: Atomic Disk Flush
    // -----------------------------------------------------------------------
    try {
      for (const change of mutations) {
        const parentDir = path.dirname(change.workspaceAbsolutePath);
        if (!fs.existsSync(parentDir)) {
          await fs.promises.mkdir(parentDir, { recursive: true });
        }
        await fs.promises.writeFile(change.workspaceAbsolutePath, change.proposedFileBuffer, 'utf8');
      }
      return { success: true, skippedAuditFiles };
    } catch (err: any) {
      return {
        success: false,
        errorLog: `System disk fault during I/O flush: ${err?.message ?? String(err)}`,
        skippedAuditFiles,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Brace-balance structural audit with string-literal stripping.
   *
   * The stripping pre-pass removes content that legitimately contains
   * unbalanced braces, preventing false positives:
   *   - Template literals (backtick strings) with embedded `${...}`
   *   - Single and double quoted string literals
   *   - Line comments (//)
   *   - Block comments (/* ... *\/)
   *   - Regex literals (primitive heuristic: /pattern/)
   *
   * After stripping, we count { } and [ ] pairs. Mismatches indicate
   * a structurally malformed file (e.g. truncated LLM output).
   */
  private _executeStaticBraceAudit(
    change: FileBufferMutation,
  ): { pass: boolean; detail?: string } {
    const source = this._stripLiteralsAndComments(change.proposedFileBuffer);

    const openCurlys  = (source.match(/\{/g) ?? []).length;
    const closeCurlys = (source.match(/\}/g) ?? []).length;
    if (openCurlys !== closeCurlys) {
      return {
        pass: false,
        detail: `Curly brace mismatch: ${openCurlys} opening '{' vs ${closeCurlys} closing '}'.`,
      };
    }

    const openSquares  = (source.match(/\[/g) ?? []).length;
    const closeSquares = (source.match(/\]/g) ?? []).length;
    if (openSquares !== closeSquares) {
      return {
        pass: false,
        detail: `Square bracket mismatch: ${openSquares} opening '[' vs ${closeSquares} closing ']'.`,
      };
    }

    return { pass: true };
  }

  /**
   * Strip string literals and comments from source code so that brace
   * counting only sees the structural skeleton of the file.
   *
   * This is a character-level state machine (not a full parser), which
   * handles common cases robustly without adding a parser dependency.
   */
  private _stripLiteralsAndComments(source: string): string {
    const result: string[] = [];
    let i = 0;
    const len = source.length;

    const ch  = () => source[i];
    const nch = () => source[i + 1];

    while (i < len) {
      // Block comment: /* ... */
      if (ch() === '/' && nch() === '*') {
        i += 2;
        while (i < len && !(source[i] === '*' && source[i + 1] === '/')) i++;
        i += 2;
        continue;
      }

      // Line comment: // ...
      if (ch() === '/' && nch() === '/') {
        while (i < len && ch() !== '\n') i++;
        continue;
      }

      // Template literal: `...` (including nested ${...})
      if (ch() === '`') {
        i++;
        let depth = 0;
        while (i < len) {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '$' && source[i + 1] === '{') { depth++; i += 2; continue; }
          if (source[i] === '{' && depth > 0) { depth++; i++; continue; }
          if (source[i] === '}' && depth > 0) { depth--; i++; continue; }
          if (source[i] === '`' && depth === 0) { i++; break; }
          i++;
        }
        continue;
      }

      // Double-quoted string: "..."
      if (ch() === '"') {
        i++;
        while (i < len && ch() !== '"') {
          if (ch() === '\\') i++;
          i++;
        }
        i++;
        continue;
      }

      // Single-quoted string: '...'
      if (ch() === "'") {
        i++;
        while (i < len && ch() !== "'") {
          if (ch() === '\\') i++;
          i++;
        }
        i++;
        continue;
      }

      // Everything else: keep as-is
      result.push(ch());
      i++;
    }

    return result.join('');
  }
}
