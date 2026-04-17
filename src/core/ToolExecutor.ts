import { ToolCall } from './ToolParser';
import { FileTools } from '../tools/FileTools';
import { TerminalTools } from '../tools/TerminalTools';
import { WebSearchTools } from '../tools/WebSearchTools';
import { ScraperTools } from '../tools/ScraperTools';
import { FigmaTools } from '../tools/FigmaTools';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { execSync } from 'child_process';

export class ToolExecutor {
    private currentWorkingDir: string;

    constructor(private workspaceRoot?: string) {
        this.currentWorkingDir = workspaceRoot || process.cwd();
    }

    public getCurrentDir(): string {
        return this.currentWorkingDir;
    }

    async execute(tool: ToolCall): Promise<string> {
        console.log(`[ToolExecutor] [CWD: ${this.currentWorkingDir}] Executing ${tool.name} with params:`, tool.params);
        try {
            let result: string;
            switch (tool.name) {
                case 'read_file': {
                    const filePath = this.resolvePath(tool.params.path || tool.args);
                    const start = tool.params.start ? parseInt(tool.params.start) : undefined;
                    const end = tool.params.end ? parseInt(tool.params.end) : undefined;
                    let content = await FileTools.readFile(filePath, start, end);

                    if (filePath.toLowerCase().includes('web_cache')) {
                        content = `[IMPORTANT DOCUMENTATION: WEB-CACHE]\nThis document contains official, real-time documentation retrieved from the web. It is MORE AUTHORITATIVE than your general knowledge. Follow its specific versions, parameters, and patterns strictly.\n\n${content}`;
                    }

                    result = content;
                    break;
                }
                
                case 'append_memory': {
                    if (!this.workspaceRoot) {
                        result = "Error: No workspace root defined for memory.";
                        break;
                    }
                    const memoryPath = path.join(this.workspaceRoot, '.mirror', 'memory.md');
                    const content = tool.args.trim();
                    result = await FileTools.appendFile(memoryPath, `- ${content}`);
                    break;
                }

                case 'search_file': {
                    const filePath = this.resolvePath(tool.params.path || '');
                    const query = tool.params.query || tool.args;
                    if (!filePath) {
                        result = "Error: search_file requires a path.";
                        break;
                    }
                    result = await FileTools.searchFile(filePath, query);
                    break;
                }

                case 'get_figma_colors': {
                    const fileId = tool.params.file_id || tool.args;
                    const token = vscode.workspace.getConfiguration('mirror-vs').get<string>('figmaAccessToken') || '';
                    result = await FigmaTools.getColors(fileId, token);
                    break;
                }

                case 'get_figma_typography': {
                    const fileId = tool.params.file_id || tool.args;
                    const token = vscode.workspace.getConfiguration('mirror-vs').get<string>('figmaAccessToken') || '';
                    result = await FigmaTools.getTypography(fileId, token);
                    break;
                }

                case 'get_figma_layout': {
                    const fileId = tool.params.file_id;
                    const nodeId = tool.params.node_id;
                    const token = vscode.workspace.getConfiguration('mirror-vs').get<string>('figmaAccessToken') || '';
                    if (!fileId || !nodeId) {
                        result = "Error: get_figma_layout requires file_id and node_id.";
                        break;
                    }
                    result = await FigmaTools.getLayout(fileId, nodeId, token);
                    break;
                }
                
                case 'write_file': {
                    // NEW FIX: Prevent tool syntax mix-ups (Bug 2)
                    if (tool.args.includes('<search>') && tool.args.includes('<replace>')) {
                        result = "Execution Error: You used <search> and <replace> tags inside <write_file>. If you want to modify an existing file, you MUST use the <replace_block> tool instead.";
                        break;
                    }

                    const filePath = this.resolvePath(tool.params.path || tool.args);
                    // Strip common Gemma/LLM leaked control tokens
                    let cleanContent = tool.args.replace(/<\|"\|>|<\|endoftext\|>|<eos>|<channel\|>/g, '').trim();

                    // Fix stringified newlines and quotes (Fixes the \n Bug)
                    if (cleanContent.includes('\\n') && !cleanContent.includes('\n')) {
                        cleanContent = cleanContent.replace(/\\n/g, '\n').replace(/\\"/g, '"');
                    }

                    const writeResult = await FileTools.writeFile(filePath, cleanContent);
                    const validation = await this.validateFile(filePath);
                    result = validation ? `${writeResult}\n\n[CRITICAL NUDGE: LINT/SYNTAX ERRORS DETECTED]\nYour last update introduced errors. You MUST <read_file> the affected lines to verify the exact state before attempting to fix them. DO NOT fix blindly.\n\n${validation}` : writeResult;
                    break;
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
                        
                        let replaceResult = await FileTools.replaceBlock(filePath, search, replace);
                        
                        // ENRICHED ERROR HANDLING: If search block not found, give adaptive nudges
                        if (replaceResult.includes("Search block not found") && fs.existsSync(filePath)) {
                            const content = fs.readFileSync(filePath, 'utf8');
                            const lineCount = content.split('\n').length;
                            
                            if (lineCount < 100) {
                                replaceResult += `\n\n[CRITICAL ERROR NUDGE]\nThe file is small (${lineCount} lines). Do not keep trying replace_block. Instead, use <read_file> to see the current state, and then use <write_file> to rewrite the entire file with your changes. This is much more reliable for small files.`;
                            } else {
                                replaceResult += `\n\n[CRITICAL ERROR NUDGE]\nThe search block was not found. Please use <read_file> (possibly with start/end lines) to verify the EXACT whitespace, indentation, and content of the block you are trying to replace before trying again.`;
                            }
                        }

                        const validation = await this.validateFile(filePath);
                        result = validation ? `${replaceResult}\n\n[CRITICAL NUDGE: LINT/SYNTAX ERRORS DETECTED]\nYour last update introduced errors. You MUST <read_file> the affected lines to verify the exact state before attempting to fix them. DO NOT fix blindly.\n\n${validation}` : replaceResult;
                    } else {
                        result = "Error: replace_block requires path, search, and replace (as attributes or tags).";
                    }
                    break;
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
                            result = `CWD updated to: ${this.currentWorkingDir}`;
                        } else {
                            result = `Error: Directory "${targetDir}" not found.`;
                        }
                    } else {
                        result = await TerminalTools.runCommand(cmd, this.currentWorkingDir);
                    }
                    break;

                case 'list_dir':
                    const dirPath = this.resolvePath(tool.params.path || tool.args || '.');
                    const items = fs.readdirSync(dirPath, { withFileTypes: true });
                    result = items.map(i => `${i.isDirectory() ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n');
                    break;

                case 'web_search':
                    result = await WebSearchTools.search(tool.params.query || tool.args, this.workspaceRoot || this.currentWorkingDir);
                    break;

                case 'read_url':
                    result = await ScraperTools.scrapeUrl(tool.params.url || tool.args, this.workspaceRoot || this.currentWorkingDir);
                    break;

                default:
                    result = `Error: Unknown tool "${tool.name}".`;
                    break;
            }
            return `[CURRENT DIRECTORY: ${this.currentWorkingDir}]\n\n${result}`;
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

    private async validateFile(filePath: string): Promise<string | null> {
        const ext = path.extname(filePath);
        if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
            return null;
        }

        try {
            // Prioritize the current working directory as it's likely the project root the agent is working in
            const cwd = this.currentWorkingDir || this.workspaceRoot || process.cwd();
            
            // Look for package.json to verify eslint is set up
            const pkgPath = path.join(cwd, 'package.json');
            if (!fs.existsSync(pkgPath)) {
                console.log(`[Validator] Skipped: No package.json found at ${cwd}`);
                return null;
            }

            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const hasEslint = (pkg.dependencies?.eslint) || (pkg.devDependencies?.eslint);
            
            if (hasEslint) {
                try {
                    // Execute quiet linting
                    const output = execSync(`npx eslint "${filePath}" --quiet`, { cwd, stdio: 'pipe' });
                    return null; // Success
                } catch (err: any) {
                    // ESLint exits with code 1 when errors are found
                    const errorOutput = (err.stdout?.toString() || err.stderr?.toString() || '').trim();
                    if (errorOutput) {
                        console.log(`[Validator] Detected errors in ${filePath}`);
                        return errorOutput;
                    }
                    return null;
                }
            }
            return null;
        } catch (e: any) {
            console.error(`[Validator] Error during validation: ${e.message}`);
            return null; // Fail silently but log it
        }
    }

    private resolvePath(filePath: string): string {
        if (path.isAbsolute(filePath)) {
            return filePath;
        }

        // CRITICAL FIX: Lock system files to the workspace root (Bug 1: Floating Mirror fix)
        if (filePath.startsWith('.mirror') && this.workspaceRoot) {
            return path.resolve(this.workspaceRoot, filePath);
        }

        return path.resolve(this.currentWorkingDir, filePath);
    }
}

