export const TOOL_ERROR_PATTERNS = [
  /^Unknown action\b/i,
  /^Failed to\b/i,
  /\bnot found\b/i,
  /^Invalid\b/i,
  /\berror:\s/i,
];

export const REPLY_GIVE_UP_PATTERNS = [
  /\bI don't have (?:a )?tool\b/i,
  /\bI can(?:'t|not) (?:do|find|figure)\b/i,
  /\bI'?m not sure (?:which|how|what)\b/i,
  /\b[Cc]ould you (?:tell me|specify|clarify)\b/,
  /\bunable to (?:open|find|switch|complete)\b/i,
  /\bdoesn'?t (?:exist|appear to be|seem to)\b/i,
];

/**
 * Check if an individual tool output contains error patterns.
 */
export function isToolError(result: string): boolean {
  if (!result) return false;
  if (result.includes(': Error -') || result.includes(']: Error -')) {
    return true;
  }
  for (const pattern of TOOL_ERROR_PATTERNS) {
    if (pattern.test(result)) {
      return true;
    }
  }
  return false;
}

/**
 * Evaluate the outcome of a finished turn.
 * Returns { status: 'failure', reason } if a problem is detected, otherwise { status: 'ok' }.
 */
export function evaluateTurnResult(
  toolResults: string[],
  agentReply: string,
): { status: 'ok' | 'failure'; reason?: string } {
  for (const result of toolResults) {
    if (!result) continue;
    if (result.includes(': Error -') || result.includes(']: Error -')) {
      const cleanedSnippet = result.substring(0, 120).trim();
      return {
        status: 'failure',
        reason: `tool returned error: "${cleanedSnippet}"`,
      };
    }
    for (const pattern of TOOL_ERROR_PATTERNS) {
      if (pattern.test(result)) {
        const snippet = result.substring(0, 120).trim();
        return {
          status: 'failure',
          reason: `tool result matched error pattern ${pattern.toString()}: "${snippet}"`,
        };
      }
    }
  }

  if (agentReply) {
    for (const pattern of REPLY_GIVE_UP_PATTERNS) {
      if (pattern.test(agentReply)) {
        return {
          status: 'failure',
          reason: `agent reply matched give-up pattern ${pattern.toString()}`,
        };
      }
    }
  }

  return { status: 'ok' };
}
