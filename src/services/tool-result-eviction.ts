import { ChatMessage } from '../types';
import { estimateTokens } from './model-context';

/**
 * Tool results from these tools are purely informational and can be safely
 * evicted — the model can always re-run the tool to get the content back.
 */
const EVICTABLE_TOOLS = new Set([
  'read_file',
  'grep_search',
  'list_dir',
  'semantic_search',
  'web_search',
  'analyze_project',
  'analyze_dependencies',
  'analyze_complexity',
  'analyze_coverage',
  'analyze_dead_code',
  'analyze_impact',
  'graphify',
  'browser_navigate',
  'browser_screenshot',
  'browser_evaluate_script',
  'browser_click',
  'browser_type',
  'read_terminal',
  'list_terminals',
  'get_diagnostics',
]);

/**
 * NEVER evict results from these tools — they contain checkpoint IDs, diffs,
 * and write confirmations that the model may need to reference later.
 */
const PROTECTED_TOOLS = new Set([
  'patch_file',
  'multi_patch_file',
  'write_file',
  'create_file',
  'delete_file',
  'rename_file',
  'run_command',
  'update_agent_memory',
  'update_plan',
  'git_commit',
  'send_terminal_input',
  'close_terminal',
  'figma_inspect',
]);

function extractToolName(content: string): string | null {
  // Matches: [Tool Result for read_file on "foo.ts"]: ...
  //       or [Tool Result for grep_search]: ...
  const match =
    content.match(/^\[Tool Result for ([a-z_]+) on /i) ||
    content.match(/^\[Tool Result for ([a-z_]+)\]/i);
  return match ? match[1] : null;
}

function extractTargetPath(content: string): string | null {
  const match = content.match(/^\[Tool Result for [a-z_]+ on "([^"]+)"/i);
  return match ? match[1] : null;
}

function extractQuery(content: string): string | null {
  // Try to pull out a search query or command hint from the first line
  const firstLine = content.split('\n')[0];
  const queryMatch =
    firstLine.match(/query="([^"]+)"/i) ||
    firstLine.match(/pattern="([^"]+)"/i) ||
    firstLine.match(/search="([^"]+)"/i);
  return queryMatch ? queryMatch[1] : null;
}

/**
 * Build a compact placeholder that tells the model precisely how to recover
 * the evicted content. This is the "way out" requirement.
 */
function buildEvictionPlaceholder(content: string, toolName: string, targetPath: string | null): string {
  const query = extractQuery(content);

  const recovery = (() => {
    switch (toolName) {
      case 'read_file':
        if (targetPath) {
          return `Re-read with: <read_file path="${targetPath}" /> (or with start_line/end_line for a specific range)`;
        }
        return 'Re-read the file with read_file if needed';

      case 'grep_search':
        if (query) {
          return `Re-search with: <grep_search query="${query}" />`;
        }
        return 'Re-run grep_search with your original query';

      case 'list_dir':
        if (targetPath) {
          return `Re-list with: <list_dir path="${targetPath}" />`;
        }
        return 'Re-run list_dir if needed';

      case 'get_diagnostics':
        if (targetPath) {
          return `Re-fetch with: <get_diagnostics path="${targetPath}" />`;
        }
        return 'Re-run get_diagnostics if needed';

      case 'semantic_search':
        return 'Re-run semantic_search with your original query';

      case 'web_search':
        if (query) {
          return `Re-search with: <web_search query="${query}" />`;
        }
        return 'Re-run web_search if needed';

      case 'analyze_project':
        return 'Re-analyze with: <analyze_project /> or <graphify />';

      case 'browser_navigate':
        return 'Re-navigate with browser_navigate if needed';

      case 'read_terminal':
        return 'Re-read with: <read_terminal /> if needed';

      case 'list_terminals':
        return 'Re-list with: <list_terminals /> if needed';

      default:
        return `Re-run ${toolName} if this data is still needed`;
    }
  })();

  const pathSuffix = targetPath ? ` on "${targetPath}"` : '';
  return (
    `[Tool Result for ${toolName}${pathSuffix}]: ` +
    `[Content evicted from context to reduce token usage — ${recovery}]`
  );
}

export interface ToolResultEvictionResult {
  messages: ChatMessage[];
  evictedCount: number;
  savedTokens: number;
}

/**
 * Evict old, re-readable tool results from message history to stay under a
 * token budget. Each eviction replaces the result with a compact placeholder
 * containing exact recovery instructions (the model's "way out").
 *
 * Rules:
 * - Only evicts messages categorised as EVICTABLE_TOOLS.
 * - Never evicts messages from PROTECTED_TOOLS (checkpoints, write ops).
 * - Never evicts already-evicted placeholders.
 * - Protects the N most recent messages from eviction.
 * - Oldest messages are evicted first; among same-age, largest first.
 *
 * @param messages    The current active messages array.
 * @param tokenCap    Target token budget to reduce towards.
 * @param keepRecentN How many recent messages to protect (default 8).
 */
export function evictStaleToolResults(
  messages: ChatMessage[],
  tokenCap: number,
  keepRecentN: number = 8,
): ToolResultEvictionResult {
  const currentTokens = estimateTokens(messages);
  if (currentTokens <= tokenCap) {
    return { messages, evictedCount: 0, savedTokens: 0 };
  }

  // Protect recent tail from eviction
  const protectFromIndex = Math.max(0, messages.length - keepRecentN);

  // Build the list of eviction candidates
  const candidates: { index: number; tokens: number }[] = [];
  for (let i = 0; i < protectFromIndex; i++) {
    const msg = messages[i];
    if (msg.role !== 'system') continue;
    const content = typeof msg.content === 'string' ? msg.content : '';

    // Skip non-tool-result system messages
    if (!content.startsWith('[Tool Result for ')) continue;

    // Skip already-evicted placeholders
    if (content.includes('evicted from context to reduce token usage')) continue;

    const toolName = extractToolName(content);
    if (!toolName) continue;

    // Skip protected tools
    if (PROTECTED_TOOLS.has(toolName)) continue;

    // Only evict known evictable tools
    if (!EVICTABLE_TOOLS.has(toolName)) continue;

    candidates.push({ index: i, tokens: estimateTokens([msg]) });
  }

  // Oldest first; break ties by largest (most savings first)
  candidates.sort((a, b) => a.index - b.index || b.tokens - a.tokens);

  const result = [...messages];
  let evictedCount = 0;
  let savedTokens = 0;
  let currentSize = currentTokens;

  for (const candidate of candidates) {
    if (currentSize <= tokenCap) break;

    const msg = result[candidate.index];
    const content = typeof msg.content === 'string' ? msg.content : '';
    const toolName = extractToolName(content)!;
    const targetPath = extractTargetPath(content);

    const placeholder = buildEvictionPlaceholder(content, toolName, targetPath);
    const placeholderTokens = estimateTokens([{ role: 'system', content: placeholder }]);
    const saved = candidate.tokens - placeholderTokens;

    result[candidate.index] = { ...msg, content: placeholder };
    savedTokens += saved;
    currentSize -= saved;
    evictedCount++;
  }

  return { messages: result, evictedCount, savedTokens };
}
