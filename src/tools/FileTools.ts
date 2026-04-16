import * as fs from 'fs';
import * as path from 'path';

export class FileTools {
    /**
     * Reads a file, with hard truncation to prevent context flooding.
     */
    static async readFile(filePath: string, maxLines: number = 300): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.promises.readFile(absolutePath, 'utf8');
            const lines = content.split('\n');
            
            // Increase limit for documentation/markdown files to 500 lines
            const limit = filePath.endsWith('.md') ? 500 : maxLines;
            
            if (lines.length > limit) {
                return lines.slice(0, Math.floor(limit/2)).join('\n') + 
                    `\n\n... [TRUNCATED ${lines.length - limit} LINES] ...\n\n` +
                    lines.slice(-Math.floor(limit/2)).join('\n');
            }
            return content;
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