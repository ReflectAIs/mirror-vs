import { ToolCall } from './ToolParser';
import { FileTools } from '../tools/FileTools';
import { TerminalTools } from '../tools/TerminalTools';
import { WebSearchTools } from '../tools/WebSearchTools';
import { ScraperTools } from '../tools/ScraperTools';
import * as fs from 'fs';

export class ToolExecutor {
    constructor(private workspaceRoot?: string) {}

    async execute(tool: ToolCall): Promise<string> {
        console.log(`[ToolExecutor] Executing ${tool.name} with params:`, tool.params);
        try {
            switch (tool.name) {
                case 'read_file':
                    return FileTools.readFile(this.resolvePath(tool.params.path || tool.args));
                
                case 'write_file':
                    return FileTools.writeFile(this.resolvePath(tool.params.path || tool.args), tool.args);

                case 'replace_block':
                    const path = this.resolvePath(tool.params.path || '');
                    // Prioritize <search> and <replace> tags in the body over attributes
                    const search = this.extractTag(tool.args, 'search') || tool.params.search;
                    const replace = this.extractTag(tool.args, 'replace') || tool.params.replace;
                    
                    if (path && search && replace) {
                        return FileTools.replaceBlock(path, search, replace);
                    }
                    return "Error: replace_block requires path, search, and replace (as attributes or tags).";

                case 'run_command':
                    return TerminalTools.runCommand(tool.params.cmd || tool.args, this.workspaceRoot);

                case 'list_dir':
                    const dirPath = this.resolvePath(tool.params.path || tool.args || '.');
                    const items = fs.readdirSync(dirPath, { withFileTypes: true });
                    return items.map(i => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n');

                case 'web_search':
                    return WebSearchTools.search(tool.params.query || tool.args);

                case 'read_url':
                    return ScraperTools.scrapeUrl(tool.params.url || tool.args, this.workspaceRoot);

                default:
                    return `Error: Unknown tool "${tool.name}".`;
            }
        } catch (error: any) {
            return `Execution Error: ${error.message}`;
        }
    }

    private extractTag(content: string, tag: string): string | null {
        // First try the standard strict match
        const strictRegex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
        const strictMatch = content.match(strictRegex);
        if (strictMatch) return strictMatch[1].trim();

        // Fallback: Relaxed match (especially for <search> followed by <replace>)
        // This handles cases where the model forgets the closing tag for the first block.
        if (tag === 'search') {
            const searchStartRegex = /<search>([\s\S]*?)(?:<\/search>|<replace>)/;
            const match = content.match(searchStartRegex);
            return match ? match[1].trim() : null;
        }

        if (tag === 'replace') {
            const replaceStartRegex = /<replace>([\s\S]*?)(?:<\/replace>|<\/replace_block>|$)/;
            const match = content.match(replaceStartRegex);
            return match ? match[1].trim() : null;
        }

        return null;
    }

    private resolvePath(filePath: string): string {
        if (!this.workspaceRoot || path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }
}
import * as path from 'path';
