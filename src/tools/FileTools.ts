import * as fs from 'fs';
import * as path from 'path';

export class FileTools {
    /**
     * Reads a file, with hard truncation to prevent context flooding.
     */
    static async readFile(filePath: string, maxLines: number = 100): Promise<string> {
        try {
            const absolutePath = path.resolve(filePath);
            const content = await fs.promises.readFile(absolutePath, 'utf8');
            const lines = content.split('\n');
            
            if (lines.length > maxLines) {
                return lines.slice(0, maxLines).join('\n') + `\n\n... [TRUNCATED ${lines.length - maxLines} LINES] ...`;
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
            
            if (!content.includes(search)) {
                return `Error: Search block not found in ${filePath}. Ensure you have the exact text including whitespace.`;
            }

            const newContent = content.replace(search, replace);
            await fs.promises.writeFile(absolutePath, newContent, 'utf8');
            return `Successfully updated ${filePath}.`;
        } catch (error: any) {
            return `Error updating file: ${error.message}`;
        }
    }
}
