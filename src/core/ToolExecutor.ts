import { ToolCall } from './ToolParser';
import { FileTools } from '../tools/FileTools';
import { TerminalTools } from '../tools/TerminalTools';
import { WebSearchTools } from '../tools/WebSearchTools';
import { ScraperTools } from '../tools/ScraperTools';
import * as fs from 'fs';
import * as path from 'path';

export class ToolExecutor {
    private currentWorkingDir: string;

    constructor(private workspaceRoot?: string) {
        this.currentWorkingDir = workspaceRoot || process.cwd();
    }

    async execute(tool: ToolCall): Promise<string> {
        console.log(`[ToolExecutor] [CWD: ${this.currentWorkingDir}] Executing ${tool.name} with params:`, tool.params);
        try {
            switch (tool.name) {
                case 'read_file': {
                    const filePath = this.resolvePath(tool.params.path || tool.args);
                    const start = tool.params.start ? parseInt(tool.params.start) : undefined;
                    const end = tool.params.end ? parseInt(tool.params.end) : undefined;
                    return FileTools.readFile(filePath, start, end);
                }
                
                case 'append_memory': {
                    if (!this.workspaceRoot) return "Error: No workspace root defined for memory.";
                    const memoryPath = path.join(this.workspaceRoot, '.mirror', 'memory.md');
                    const content = tool.args.trim();
                    return FileTools.appendFile(memoryPath, `- ${content}`);
                }

                case 'search_file': {
                    const filePath = this.resolvePath(tool.params.path || '');
                    const query = tool.params.query || tool.args;
                    if (!filePath) return "Error: search_file requires a path.";
                    return FileTools.searchFile(filePath, query);
                }
                
                case 'write_file': {
                    const filePath = this.resolvePath(tool.params.path || tool.args);
                    // Strip common Gemma/LLM leaked control tokens
                    const cleanContent = tool.args.replace(/<\|"\|>|<\|endoftext\|>|<eos>/g, '').trim();
                    return FileTools.writeFile(filePath, cleanContent);
                }

                case 'replace_block': {
                    const filePath = this.resolvePath(tool.params.path || '');
                    // Prioritize <search> and <replace> tags in the body over attributes
                    let search = this.extractTag(tool.args, 'search') || tool.params.search;
                    let replace = this.extractTag(tool.args, 'replace') || tool.params.replace;
                    
                    if (filePath && search && replace) {
                        // Sanitize inputs
                        search = search.replace(/<\|"\|>|<\|endoftext\|>|<eos>/g, '');
                        replace = replace.replace(/<\|"\|>|<\|endoftext\|>|<eos>/g, '');
                        return FileTools.replaceBlock(filePath, search, replace);
                    }
                    return "Error: replace_block requires path, search, and replace (as attributes or tags).";
                }

                case 'run_command':
                    const cmd = (tool.params.cmd || tool.args).trim();
                    
                    // Intercept standalone 'cd' commands to update state
                    // Make sure we DON'T intercept chained commands like "cd folder && npm install"
                    if (cmd.startsWith('cd ') && !cmd.includes('&&') && !cmd.includes(';')) {
                        const targetDir = cmd.substring(3).trim();
                        const newPath = path.resolve(this.currentWorkingDir, targetDir);
                        
                        if (fs.existsSync(newPath) && fs.statSync(newPath).isDirectory()) {
                            this.currentWorkingDir = newPath;
                            return `CWD updated to: ${this.currentWorkingDir}`;
                        } else {
                            return `Error: Directory "${targetDir}" not found.`;
                        }
                    }
                    
                    return TerminalTools.runCommand(cmd, this.currentWorkingDir);

                case 'list_dir':
                    const dirPath = this.resolvePath(tool.params.path || tool.args || '.');
                    const items = fs.readdirSync(dirPath, { withFileTypes: true });
                    return items.map(i => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n');

                case 'web_search':
                    return WebSearchTools.search(tool.params.query || tool.args);

                case 'read_url':
                    return ScraperTools.scrapeUrl(tool.params.url || tool.args, this.currentWorkingDir);

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
        if (path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.resolve(this.currentWorkingDir, filePath);
    }
}

