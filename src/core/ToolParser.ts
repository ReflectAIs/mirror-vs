export interface ToolCall {
    name: string;
    args: string;
    params: Record<string, string>;
    raw: string;
}

export class ToolParser {
    /**
     * Parses tool calls using a multi-pattern approach to ensure
     * that both standard and self-closing tags are captured accurately.
     */
    static parse(content: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        
        // 1. Hallucination Fixer: Detect <tool_name>name</tool_name><tool_args>args</tool_args>
        const halluRegex = /<tool_name>(\w+)<\/tool_name>\s*<tool_args>([\s\S]*?)<\/tool_args>/g;
        let halluMatch;
        while ((halluMatch = halluRegex.exec(content)) !== null) {
            toolCalls.push(this.createToolCall(halluMatch[1], halluMatch[2], halluMatch[0]));
        }
        if (toolCalls.length > 0) return toolCalls;

        // 2. Standard Tag Parser: Matches <tag attrs>body</tag>
        const standardRegex = /<(\w+)\s*([^>]*?)>([\s\S]*?)<\/\1>/g;
        let sMatch;
        while ((sMatch = standardRegex.exec(content)) !== null) {
            toolCalls.push({
                name: sMatch[1],
                args: sMatch[3].trim(),
                params: this.parseAttributes(sMatch[2]),
                raw: sMatch[0]
            });
        }

        // 3. Self-Closing Tag Parser: Matches <tag attrs />
        // Note: We use a separate pass to avoid regex complexity and backtracking issues
        const selfClosingRegex = /<(\w+)\s*([^>]*?)\s*\/>/g;
        let scMatch;
        while ((scMatch = selfClosingRegex.exec(content)) !== null) {
            // Avoid duplicates (if a standard tag was already matched)
            if (!toolCalls.find(tc => tc.raw === scMatch![0])) {
                toolCalls.push({
                    name: scMatch[1],
                    args: '',
                    params: this.parseAttributes(scMatch[2]),
                    raw: scMatch[0]
                });
            }
        }

        return toolCalls;
    }

    private static createToolCall(name: string, args: string, raw: string): ToolCall {
        let params: Record<string, string> = {};
        try {
            const parsed = JSON.parse(args);
            if (typeof parsed === 'object') {
                params = parsed;
            }
        } catch {
            // Not JSON
        }
        return { name, args, params, raw };
    }

    private static parseAttributes(attrStr: string): Record<string, string> {
        const params: Record<string, string> = {};
        const attrRegex = /(\w+)\s*=\s*"([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(attrStr)) !== null) {
            params[match[1]] = match[2];
        }
        return params;
    }

    /**
     * Top-level heuristic parser that falls back to open tags if no closing match is found.
     */
    static parseHeuristic(content: string): ToolCall[] {
        const results = this.parse(content);
        if (results.length > 0) return results;

        // Fallback: look for <tag ...> at the very end of the string (partial output)
        const openTagRegex = /<(\w+)\s*([^>]*)>([\s\S]*)$/;
        const match = content.match(openTagRegex);
        if (match) {
            return [{
                name: match[1],
                args: match[3].trim(),
                params: this.parseAttributes(match[2]),
                raw: match[0]
            }];
        }

        return [];
    }
}
