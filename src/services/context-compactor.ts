import { estimateTokens } from './model-context';
import { ChatMessage } from '../types';

export const COMPACT_THRESHOLD = 0.65; // Trigger compaction at 65% of context window
export const SUMMARY_MAX_TOKENS = 1024;

// Cursor-style self-summarization prompt — produces structured, dense summaries
export const SELF_SUMMARY_SYSTEM_PROMPT = `You are summarizing a conversation to preserve context after compaction. Produce a structured summary that lets the conversation continue seamlessly.

Use this format:

## Conversation Summary
**Turns summarized:** {count}  |  **Compactions so far:** {n}

### User Goal
One sentence describing what the user is trying to accomplish.

### What Was Done
- Bullet points of completed actions, decisions made, and key outputs
- Include specific file paths, function names, variable names, URLs, and config values
- Note any errors encountered and how they were resolved

### Current State
What is the system/code/task state right now? What was the last thing discussed?

### Pending / Next Steps
- What remains to be done
- Any open questions or blockers

### Key Context
- Important constraints, preferences, or decisions that must not be forgotten
- Specific values: model names, ports, paths, credentials references, versions

Keep the summary under 1000 tokens. Be dense — every token should carry information. Do not include pleasantries or meta-commentary.`;

/**
 * Flatten a message's content to plain text.
 */
function contentAsText(content: any): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((b) => (b && typeof b === 'object' && b.text ? b.text : ''))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

/**
 * Drop orphaned `tool` messages and dangling assistant `tool_calls`.
 *
 * OpenAI/Anthropic APIs require every tool response/role message to follow
 * an assistant message carrying `tool_calls`. Front-trimming history can cut
 * the assistant `tool_calls` parent while keeping its tool responses, triggering errors.
 */
export function sanitizeToolMessages(msgs: ChatMessage[]): ChatMessage[] {
  // Pass 1: drop orphan tool messages.
  const cleaned: ChatMessage[] = [];
  let inBatch = false;

  for (const m of msgs) {
    const role = m.role;
    const isToolResult = (role as string) === 'tool' || (role === 'system' && m.content.startsWith('[Tool Result for '));
    const isAssistantWithTools = role === 'assistant' && (m as any).tool_calls && (m as any).tool_calls.length > 0;

    if (isToolResult) {
      if (inBatch) {
        cleaned.push(m);
      }
      continue;
    }

    if (isAssistantWithTools) {
      inBatch = true;
    } else {
      inBatch = false;
    }
    cleaned.push(m);
  }

  // Pass 2: drop assistant tool_calls messages that have NO following
  // tool response (dangling) — walk backwards so we know what follows.
  const out: ChatMessage[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    let m = cleaned[i];
    const isAssistantWithTools = m.role === 'assistant' && (m as any).tool_calls && (m as any).tool_calls.length > 0;
    if (isAssistantWithTools) {
      const nxt = i + 1 < cleaned.length ? cleaned[i + 1] : null;
      const hasFollowingToolResult =
        nxt && ((nxt.role as string) === 'tool' || (nxt.role === 'system' && nxt.content.startsWith('[Tool Result for ')));
      if (!hasFollowingToolResult) {
        // Strip tool_calls to preserve text content while omitting unanswered tool_calls
        const { tool_calls, ...rest } = m as any;
        m = rest as ChatMessage;
        if (!m.content || !m.content.trim()) {
          continue; // nothing left
        }
      }
    }
    out.push(m);
  }

  return out;
}

function truncateTextToTokenBudget(text: string, tokenBudget: number): string {
  if (tokenBudget <= 32) {
    return '[Current user message omitted: it exceeded the model context window.]';
  }
  if (typeof text !== 'string') {
    return '';
  }
  // Match estimateTokens character rate (chars * 0.3)
  const maxChars = Math.max(200, Math.floor((tokenBudget - 16) / 0.3));
  if (text.length <= maxChars) {
    return text;
  }

  const notice =
    "\n\n[Notice: the pasted message was too large for this model's context window, so Mirror VS kept the beginning and end.]";
  const keepChars = Math.max(200, maxChars - notice.length);
  const headLen = Math.max(100, Math.floor(keepChars * 0.7));
  const tailLen = Math.max(80, keepChars - headLen);

  return text.substring(0, headLen).trimEnd() + notice + '\n\n' + text.substring(text.length - tailLen).trimStart();
}

function truncateToolCallArgs(msg: any, tokenBudget: number): any {
  const toolCalls = msg.tool_calls;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return msg;
  }
  const contentTokens = estimateTokens([{ role: msg.role, content: msg.content }]);
  const perCall = Math.max(16, Math.floor(Math.max(0, tokenBudget - contentTokens) / toolCalls.length));

  let changed = false;
  const newCalls = [];
  for (const tc of toolCalls) {
    if (tc && typeof tc === 'object') {
      const fn = tc.function || tc;
      const args = fn.arguments;
      if (typeof args === 'string' && Math.floor(args.length * 0.3) > perCall) {
        const newFn = { ...fn, arguments: JSON.stringify({ _truncated_for_context: args.length }) };
        const newTc = tc.function ? { ...tc, function: newFn } : newFn;
        newCalls.push(newTc);
        changed = true;
      } else {
        newCalls.push(tc);
      }
    } else {
      newCalls.push(tc);
    }
  }

  if (!changed) {
    return msg;
  }
  return { ...msg, tool_calls: newCalls };
}

function truncateMessageToTokenBudget(msg: ChatMessage, tokenBudget: number): ChatMessage {
  const out = { ...msg } as any;
  const content = out.content;
  if (typeof content === 'string') {
    out.content = truncateTextToTokenBudget(content, tokenBudget);
  } else if (Array.isArray(content)) {
    let remaining = tokenBudget;
    const newContent = [];
    for (const item of content) {
      if (item && typeof item === 'object' && item.type === 'text') {
        const text = item.text || '';
        const truncated = truncateTextToTokenBudget(text, remaining);
        newContent.push({ ...item, text: truncated });
        remaining -= Math.floor(truncated.length * 0.3) + 4;
      } else {
        newContent.push(item);
      }
    }
    out.content = newContent;
  }
  return truncateToolCallArgs(out, tokenBudget);
}

/**
 * Trim messages progressively to fit within the context budget limits.
 */
export function trimForContext(
  messages: ChatMessage[],
  contextLength: number,
  reserveTokens: number = 512,
): ChatMessage[] {
  const sanitized = sanitizeToolMessages(messages);
  const budget = contextLength - reserveTokens;
  const used = estimateTokens(sanitized);
  if (used <= budget) {
    return sanitized;
  }

  // Separate system messages, protected messages, and conversation
  const systemMsgs: ChatMessage[] = [];
  const protectedMsgs: ChatMessage[] = [];
  const convoMsgs: ChatMessage[] = [];

  for (const msg of messages) {
    if ((msg as any)._protected) {
      protectedMsgs.push(msg);
    } else if (msg.role === 'system') {
      systemMsgs.push(msg);
    } else {
      convoMsgs.push(msg);
    }
  }

  const protectedTokens = estimateTokens(protectedMsgs);
  let remainingBudget = budget - protectedTokens;

  // Priority: keep first system msg (preset prompt), drop others (memory, RAG)
  const essentialSystem = systemMsgs.length > 0 ? [systemMsgs[0]] : [];
  const extraSystem = systemMsgs.slice(1);

  // Try dropping extra system messages one by one (from the end)
  const trimmedCandidate = [...essentialSystem, ...convoMsgs];
  if (estimateTokens(trimmedCandidate) <= remainingBudget) {
    const result = [...essentialSystem];
    for (const msg of extraSystem) {
      const candidate = [...result, msg, ...convoMsgs];
      if (estimateTokens(candidate) <= remainingBudget) {
        result.push(msg);
      } else {
        break;
      }
    }
    return sanitizeToolMessages([...result, ...protectedMsgs, ...convoMsgs]);
  }

  // Still too big - truncate the first system message if large
  if (essentialSystem.length > 0) {
    const sysText = essentialSystem[0].content || '';
    if (sysText.length > 2000) {
      essentialSystem[0] = {
        role: 'system',
        content: sysText.substring(0, 2000) + '\n[System prompt truncated for context limits]',
      };
      const trimmed = [...essentialSystem, ...convoMsgs];
      if (estimateTokens(trimmed) <= remainingBudget) {
        return sanitizeToolMessages([...essentialSystem, ...protectedMsgs, ...convoMsgs]);
      }
    }
  }

  // Still too big - drop older conversation turns but keep the current user turn.
  const PROTECT_RECENT = 10;
  const currentMsg = convoMsgs.slice(-1);
  const priorConvo = convoMsgs.slice(0, -1);

  let convoResult: ChatMessage[] = [];
  if (priorConvo.length >= PROTECT_RECENT) {
    const oldMsgs = priorConvo.slice(0, -(PROTECT_RECENT - 1));
    const recentMsgs = [...priorConvo.slice(-(PROTECT_RECENT - 1)), ...currentMsg];

    while (oldMsgs.length > 0 && estimateTokens([...essentialSystem, ...oldMsgs, ...recentMsgs]) > remainingBudget) {
      oldMsgs.shift();
    }
    convoResult = [...oldMsgs, ...recentMsgs];
  } else {
    const tempPrior = [...priorConvo];
    while (
      tempPrior.length > 0 &&
      estimateTokens([...essentialSystem, ...tempPrior, ...currentMsg]) > remainingBudget
    ) {
      tempPrior.shift();
    }
    convoResult = [...tempPrior, ...currentMsg];
  }

  // If the current message itself is too large, shrink only that message
  if (
    currentMsg.length > 0 &&
    estimateTokens([...essentialSystem, ...protectedMsgs, ...convoResult]) > remainingBudget
  ) {
    const prefix = [...essentialSystem, ...protectedMsgs, ...convoResult.slice(0, -1)];
    const availableForCurrent = Math.max(64, remainingBudget - estimateTokens(prefix));
    convoResult[convoResult.length - 1] = truncateMessageToTokenBudget(
      convoResult[convoResult.length - 1],
      availableForCurrent,
    );
  }

  return sanitizeToolMessages([...essentialSystem, ...protectedMsgs, ...convoResult]);
}

/**
 * Check context usage and compact older history via a summarization callback.
 */
export async function maybeCompact(
  messages: ChatMessage[],
  contextLength: number,
  summarizeFn: (prompt: ChatMessage[]) => Promise<string>,
): Promise<{ compactedMessages: ChatMessage[]; wasCompacted: boolean }> {
  const activeMessages = messages.filter((m) => !m.summarized);
  const used = estimateTokens(activeMessages);
  const pct = contextLength ? used / contextLength : 0;

  if (pct < COMPACT_THRESHOLD) {
    return { compactedMessages: messages, wasCompacted: false };
  }

  // Separate system preface, conversation, and existing summaries
  const systemMsgs: ChatMessage[] = [];
  const convoMsgs: ChatMessage[] = [];
  const existingSummaries: ChatMessage[] = [];
  const alreadySummarized: ChatMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (msg.content && msg.content.startsWith('[Conversation summary')) {
        existingSummaries.push(msg);
      } else if (msg.content && msg.content.includes('[Conversation summary')) {
        // Merged system message
        const summaryIndex = msg.content.indexOf('\n\n[Conversation summary');
        const originalContent = msg.content.substring(0, summaryIndex);
        const summaryContent = msg.content.substring(summaryIndex + 2); // skip newlines

        existingSummaries.push({ role: 'system', content: summaryContent });
        systemMsgs.push({ ...msg, content: originalContent });
      } else {
        systemMsgs.push(msg);
      }
    } else if (msg.summarized) {
      alreadySummarized.push(msg);
    } else {
      convoMsgs.push(msg);
    }
  }

  if (convoMsgs.length < 4) {
    return { compactedMessages: messages, wasCompacted: false };
  }

  // Split conversation: summarize older half, keep recent half.
  // Adjust splitPoint to avoid splitting between an assistant message with tool_calls and its corresponding tool results.
  let splitPoint = Math.floor(convoMsgs.length / 2);
  while (splitPoint < convoMsgs.length) {
    const currentMsg = convoMsgs[splitPoint];
    const isToolResult = (currentMsg.role as string) === 'tool' || 
                         (currentMsg.role === 'system' && currentMsg.content && currentMsg.content.startsWith('[Tool Result for '));
    
    const prevMsg = splitPoint > 0 ? convoMsgs[splitPoint - 1] : null;
    const prevHasToolCalls = prevMsg && prevMsg.role === 'assistant' && (prevMsg as any).tool_calls && (prevMsg as any).tool_calls.length > 0;
    
    if (isToolResult || prevHasToolCalls) {
      splitPoint++;
    } else {
      break;
    }
  }

  const older = convoMsgs.slice(0, splitPoint);
  const recent = convoMsgs.slice(splitPoint);

  // Build the text to summarize
  let convoText = '';
  if (existingSummaries.length > 0) {
    convoText += "PREVIOUS CONVERSATION SUMMARIES:\n" + existingSummaries.map(s => s.content).join('\n\n') + "\n\nNEW MESSAGES TO SUMMARIZE:\n";
  }
  convoText += older
    .map((msg) => `${msg.role.toUpperCase()}: ${contentAsText(msg.content).substring(0, 2000)}`)
    .join('\n');

  // Count prior compactions from existing summary messages
  const compactionCount = existingSummaries.length;

  const prompt = SELF_SUMMARY_SYSTEM_PROMPT.replace('{count}', String(older.length)).replace(
    '{n}',
    String(compactionCount + 1),
  );

  const summaryMessages: ChatMessage[] = [
    { role: 'system', content: prompt },
    { role: 'user', content: convoText },
  ];

  try {
    const summary = await summarizeFn(summaryMessages);

    // To ensure compatibility across all API providers (many of which only support a single
    // system message at the very beginning of the chat log), we merge the conversation
    // summary directly into the primary system message (the system prompt) if it exists.
    let compactedMessages: ChatMessage[];

    // Mark older messages as summarized
    const newlySummarized = older.map((msg) => ({
      ...msg,
      summarized: true,
    }));

    if (systemMsgs.length > 0) {
      const primarySystemMsg = systemMsgs[0];
      const summaryHeader = `\n\n[Conversation summary — earlier messages were compacted]\n${summary}`;
      const mergedSystemMsg: ChatMessage = {
        ...primarySystemMsg,
        content: primarySystemMsg.content + summaryHeader,
      };
      (mergedSystemMsg as any).compacted = true;
      (mergedSystemMsg as any).summarizedCount = splitPoint;
      compactedMessages = [mergedSystemMsg, ...systemMsgs.slice(1), ...alreadySummarized, ...newlySummarized, ...recent];
    } else {
      const summaryMsg: ChatMessage = {
        role: 'system',
        content: `[Conversation summary — earlier messages were compacted]\n${summary}`,
      };
      (summaryMsg as any).compacted = true;
      (summaryMsg as any).summarizedCount = splitPoint;
      compactedMessages = [summaryMsg, ...alreadySummarized, ...newlySummarized, ...recent];
    }
    return { compactedMessages, wasCompacted: true };
  } catch (error) {
    console.error('Compaction summary failed:', error);
    return { compactedMessages: messages, wasCompacted: false };
  }
}
