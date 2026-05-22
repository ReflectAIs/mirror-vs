export interface LineDiffResult {
  type: 'added' | 'removed' | 'common';
  line: string;
  originalLineNum?: number;
  proposedLineNum?: number;
}

/**
 * Computes a robust line-by-line diff between two strings.
 * Uses a dynamic programming LCS when size is manageable,
 * and falls back to a fast sliding-window match for extremely large files to prevent OOM.
 */
export function diffLines(original: string, proposed: string): LineDiffResult[] {
  if (!original && !proposed) {
    return [];
  }
  if (!original) {
    return proposed.split(/\r?\n/).map((line, idx) => ({ type: 'added', line, proposedLineNum: idx }));
  }
  if (!proposed) {
    return original.split(/\r?\n/).map((line, idx) => ({ type: 'removed', line, originalLineNum: idx }));
  }

  const a = original.split(/\r?\n/);
  const b = proposed.split(/\r?\n/);
  const n = a.length;
  const m = b.length;

  // Use DP LCS for small/medium files (<= 4,000,000 grid size, e.g., 2000x2000 lines)
  if (n * m <= 4000000) {
    const dp: number[][] = [];
    for (let i = 0; i <= n; i++) {
      dp.push(new Array(m + 1).fill(0));
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    const results: LineDiffResult[] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        results.push({
          type: 'common',
          line: a[i - 1],
          originalLineNum: i - 1,
          proposedLineNum: j - 1,
        });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        results.push({
          type: 'added',
          line: b[j - 1],
          proposedLineNum: j - 1,
        });
        j--;
      } else {
        results.push({
          type: 'removed',
          line: a[i - 1],
          originalLineNum: i - 1,
        });
        i--;
      }
    }

    return results.reverse();
  } else {
    // Fallback for massive files: O(N) sliding window matcher with lookahead of 50 lines
    const results: LineDiffResult[] = [];
    let i = 0;
    let j = 0;

    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        results.push({
          type: 'common',
          line: a[i],
          originalLineNum: i,
          proposedLineNum: j,
        });
        i++;
        j++;
      } else {
        // Look ahead up to 50 lines to find a matching line in A
        let matchOffset = -1;
        for (let k = 1; k <= 50; k++) {
          if (i + k < n && j < m && a[i + k] === b[j]) {
            matchOffset = k;
            break;
          }
        }

        if (matchOffset !== -1) {
          // Lines from i to i + matchOffset were deleted
          for (let k = 0; k < matchOffset; k++) {
            results.push({
              type: 'removed',
              line: a[i],
              originalLineNum: i,
            });
            i++;
          }
        } else {
          // Line in B is newly added
          results.push({
            type: 'added',
            line: b[j],
            proposedLineNum: j,
          });
          j++;
        }
      }
    }

    return results;
  }
}
