import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MirrorTool {
    name: string;
    description: string;
    parameters: any;
    execute: (args: any) => Promise<string>;
}

export class ReadFileTool implements MirrorTool {
    name = 'read_file';
    description = 'Read the contents of a file in the workspace.';
    parameters = {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'The relative path to the file.' }
        },
        required: ['path']
    };

    async execute(args: { path: string }): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceRoot) throw new Error('No workspace folder open.');
        const fullPath = path.join(workspaceRoot, args.path);
        try {
            const content = await fs.readFile(fullPath, 'utf-8');
            return content;
        } catch (err: any) {
            return `Error reading file: ${err.message}`;
        }
    }
}

export class WriteFileTool implements MirrorTool {
    name = 'write_file';
    description = 'Create or update a file in the workspace.';
    parameters = {
        type: 'object',
        properties: {
            path: { type: 'string', description: 'The relative path to the file.' },
            content: { type: 'string', description: 'The content to write.' }
        },
        required: ['path', 'content']
    };

    async execute(args: { path: string, content: string }): Promise<string> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!workspaceRoot) throw new Error('No workspace folder open.');
        const fullPath = path.join(workspaceRoot, args.path);
        try {
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, args.content, 'utf-8');
            return `Successfully wrote to ${args.path}`;
        } catch (err: any) {
            return `Error writing file: ${err.message}`;
        }
    }
}
