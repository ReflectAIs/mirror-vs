import { ToolCall } from './ToolParser';
import { FileTools } from '../tools/FileTools';
import { TerminalTools } from '../tools/TerminalTools';
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
                    const search = tool.params.search || this.extractTag(tool.args, 'search');
                    const replace = tool.params.replace || this.extractTag(tool.args, 'replace');
                    
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

                default:
                    return `Error: Unknown tool "${tool.name}".`;
            }
        } catch (error: any) {
            return `Execution Error: ${error.message}`;
        }
    }

    private extractTag(content: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`);
        const match = content.match(regex);
        return match ? match[1].trim() : null;
    }

    private resolvePath(filePath: string): string {
        if (!this.workspaceRoot || path.isAbsolute(filePath)) {
            return filePath;
        }
        return path.join(this.workspaceRoot, filePath);
    }
}
import * as path from 'path';
