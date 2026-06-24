import { ToolCall, ChatMessage } from '../types';

export async function executeHistoryTool(tool: ToolCall, activeMessages?: ChatMessage[]): Promise<string> {
  const name = tool.name;

  if (name === 'search_chat_history') {
    const query = tool.query || tool.pattern || tool.content || '';
    if (!query) {
      throw new Error('Missing "query" parameter for search_chat_history.');
    }

    const limitVal = tool.limit !== undefined ? Number(tool.limit) : 5;
    const limit = isNaN(limitVal) ? 5 : Math.max(1, Math.min(50, limitVal));

    if (!activeMessages || activeMessages.length === 0) {
      return 'No chat history found for the current session.';
    }

    const lowerQuery = query.toLowerCase();
    const matches: { index: number; role: string; content: string; summarized: boolean }[] = [];

    activeMessages.forEach((msg, idx) => {
      let matchText = '';
      if (typeof msg.content === 'string') {
        matchText += msg.content;
      } else if (Array.isArray(msg.content)) {
        matchText += msg.content.map((c: any) => c.text || '').join(' ');
      }

      // Include tool call names/arguments if present
      if ((msg as any).tool_calls) {
        try {
          matchText += ' ' + JSON.stringify((msg as any).tool_calls);
        } catch {
          /* ignore */
        }
      }

      if (matchText.toLowerCase().includes(lowerQuery) || msg.role.toLowerCase().includes(lowerQuery)) {
        matches.push({
          index: idx + 1,
          role: msg.role,
          content: matchText,
          summarized: !!msg.summarized,
        });
      }
    });

    if (matches.length === 0) {
      return `No matches found for query "${query}" in the session's chat history.`;
    }

    let output = `## Chat History Search Results\n\n`;
    output += `Found ${matches.length} matches for "${query}" (showing up to ${limit}):\n\n`;

    const sliced = matches.slice(-limit); // Show most recent matches first or last? Slicing last limit matches.
    sliced.forEach((match) => {
      const stateLabel = match.summarized ? ' [Pruned/Outside Window]' : ' [Active Context]';
      const snippet = match.content.length > 800
        ? match.content.substring(0, 400) + '\n... [truncated] ...\n' + match.content.substring(match.content.length - 400)
        : match.content;

      output += `### Turn ${match.index} (${match.role.toUpperCase()})${stateLabel}\n`;
      output += `\`\`\`\n${snippet}\n\`\`\`\n\n`;
    });

    return output;
  }

  throw new Error(`Invalid history tool: ${name}`);
}
