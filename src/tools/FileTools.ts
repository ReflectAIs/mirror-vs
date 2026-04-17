import * as fs from 'fs';
import * as path from 'path';

export class FileTools {
    /**
     * Reads a file, with hard truncation to prevent context flooding.
     */
    /**
     * Reads a file, with pagination and truncation to prevent context flooding.
     */
    static async readFile(filePath: string, startLine?: number, endLine?: number): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.promises.readFile(absolutePath, 'utf8');
            const lines = content.split('\n');
            
            // If start/end are provided, return that specific slice
            if (startLine !== undefined || endLine !== undefined) {
                const start = Math.max(0, (startLine || 1) - 1);
                const end = endLine || lines.length;
                const slice = lines.slice(start, end);
                return slice.join('\n') + `\n\n[FILE: ${filePath} | LINES ${start + 1} TO ${Math.min(end, lines.length)} OF ${lines.length}]`;
            }

            // Default behavior: 500 line limit
            const limit = 500;
            let result = '';
            if (lines.length > limit) {
                result = lines.slice(0, 250).join('\n') + 
                    `\n\n... [TRUNCATED ${lines.length - limit} LINES] ...\n\n` +
                    lines.slice(-250).join('\n') +
                    `\n\n[FILE: ${filePath} | TRUNCATED TO 500 LINES (250 START + 250 END) OUT OF ${lines.length}]`;
            } else {
                result = content;
            }

            // Hard character limit: Prevent context flooding (Fixes Overload Amnesia)
            if (result.length > 8000) {
                result = result.substring(0, 8000) + "\n\n...[TRUNCATED DUE TO LENGTH]...\nSYSTEM ALERT: This file is too large. Use <search_file> to find specific keywords.";
            }

            return result;
        } catch (error: any) {
            return `Error reading file: ${error.message}`;
        }
    }

    static async writeFile(filePath: string, content: string): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            await fs.promises.writeFile(absolutePath, content, 'utf8');
            return `Successfully wrote to ${filePath}`;
        } catch (error: any) {
            return `Error writing file: ${error.message}`;
        }
    }

    /**
     * Appends a single line to a file. Useful for project memory.
     */
    static async appendFile(filePath: string, content: string): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const dir = path.dirname(absolutePath);
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
            }
            const cleanContent = content.trim() + '\n';
            await fs.promises.appendFile(absolutePath, cleanContent, 'utf8');
            return `Successfully appended to ${filePath}`;
        } catch (error: any) {
            return `Error appending to file: ${error.message}`;
        }
    }

    /**
     * Searches for a pattern in a file and returns line numbers.
     */
    static async searchFile(filePath: string, query: string): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.promises.readFile(absolutePath, 'utf8');
            const lines = content.split('\n');
            const results: string[] = [];
            
            const regex = new RegExp(query, 'gi');
            
            lines.forEach((line, index) => {
                if (regex.test(line)) {
                    results.push(`L${index + 1}: ${line.trim()}`);
                }
            });

            if (results.length === 0) {
                return `No matches found for "${query}" in ${filePath}.`;
            }

            if (results.length > 50) {
                return results.slice(0, 50).join('\n') + `\n\n... [TRUNCATED ${results.length - 50} MORE MATCHES] ...`;
            }

            return results.join('\n');
        } catch (error: any) {
            return `Error searching file: ${error.message}`;
        }
    }

    static async replaceBlock(filePath: string, search: string, replace: string): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.promises.readFile(absolutePath, 'utf8');

            // 1. Escape special regex characters in the search string
            const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 2. Replace all static whitespace blocks with a flexible \s+ regex matcher
            const flexibleSearchRegex = new RegExp(escapedSearch.replace(/\s+/g, '\\s+'), 'g');

            const matches = content.match(flexibleSearchRegex) || [];
            const count = matches.length;

            if (count > 1) {
                return `Error: Search block occurs ${count} times in ${filePath}. Please provide a more specific search block with more context to ensure uniqueness.`;
            }
            if (count === 0) {
                return `Error: Search block not found in ${filePath}. Check your target block.`;
            }

            // 3. Perform the replacement using the flexible regex
            const newContent = content.replace(flexibleSearchRegex, replace);
            await fs.promises.writeFile(absolutePath, newContent, 'utf8');
            return `Successfully updated ${filePath}.`;
        } catch (error: any) {
            return `Error updating file: ${error.message}`;
        }
    }
}