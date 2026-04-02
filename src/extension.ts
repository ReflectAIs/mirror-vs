import * as vscode from 'vscode';
import { MirrorWebviewViewProvider } from './MirrorWebviewViewProvider';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import axios from 'axios';

let brainProcess: ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext) {
    const provider = new MirrorWebviewViewProvider(context.extensionUri, context);

    // 1. Launch the Brain Server
    const brainOutput = vscode.window.createOutputChannel('Mirror Code Brain');
    brainOutput.show(true);

    const serverPath = path.join(context.extensionPath, 'server', 'index.js');
    brainProcess = spawn('node', [serverPath], {
        cwd: path.join(context.extensionPath, 'server'),
        env: { ...process.env, DEBUG: '*' }
    });

    brainProcess.stdout?.on('data', (data) => brainOutput.append(data.toString()));
    brainProcess.stderr?.on('data', (data) => brainOutput.append(data.toString()));

    brainProcess.on('exit', (code) => {
        brainOutput.appendLine(`Brain server exited with code ${code}`);
    });

    brainProcess.on('error', (err) => {
        brainOutput.appendLine(`Failed to start Brain server: ${err.message}`);
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MirrorWebviewViewProvider.viewType,
            provider
        )
    );

    // 2. Automate Indexing with File System Watcher
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.{ts,tsx,js,jsx,py,go}');
    
    const triggerIndex = async (uri: vscode.Uri) => {
        try {
            await axios.post('http://localhost:3000/index', {
                filepath: uri.fsPath
            });
        } catch (e) {
            console.error('Failed to auto-index file:', e);
        }
    };

    watcher.onDidCreate(triggerIndex);
    watcher.onDidChange(triggerIndex);
    
    context.subscriptions.push(watcher);

    // 3. LSP Bridge Command: Get Definition
    const getDefCmd = vscode.commands.registerCommand('mirror-code.getDefinition', async (uriStr: string, line: number, character: number) => {
        const uri = vscode.Uri.parse(uriStr);
        const pos = new vscode.Position(line, character);
        const definitions: any = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', uri, pos);
        
        if (definitions && definitions.length > 0) {
            const def = definitions[0];
            const document = await vscode.workspace.openTextDocument(def.uri || def.targetUri);
            const range = def.range || def.targetRange;
            return document.getText(range);
        }
        return null;
    });

    // 4. Terminal Command
    let mirrorTerminal: vscode.Terminal | undefined;
    const openTermCmd = vscode.commands.registerCommand('mirror-code.openTerminal', () => {
        if (!mirrorTerminal || mirrorTerminal.exitStatus) {
            mirrorTerminal = vscode.window.createTerminal('Mirror Code');
        }
        mirrorTerminal.show();
    });

    // 5. Diagnostics Bridge
    const diagCmd = vscode.commands.registerCommand('mirror-code.getDiagnostics', (uriStr: string) => {
        const uri = vscode.Uri.parse(uriStr);
        const diags = vscode.languages.getDiagnostics(uri);
        return diags.map(d => ({
            message: d.message,
            severity: vscode.DiagnosticSeverity[d.severity],
            line: d.range.start.line + 1,
            character: d.range.start.character + 1
        }));
    });

    // 6. Symbols Bridge
    const symbolCmd = vscode.commands.registerCommand('mirror-code.getSymbols', async (uriStr: string) => {
        const uri = vscode.Uri.parse(uriStr);
        const symbols: any[] = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri) || [];
        
        function flatten(syms: any[]): any[] {
            let res: any[] = [];
            for (const s of syms) {
                res.push({
                    name: s.name,
                    kind: vscode.SymbolKind[s.kind],
                    line: s.range.start.line + 1
                });
                if (s.children) res = res.concat(flatten(s.children));
            }
            return res;
        }
        return flatten(symbols);
    });

    let disposable = vscode.commands.registerCommand('mirror-code.openChat', () => {
        vscode.commands.executeCommand('mirror-code.sidebar.focus');
    });

    const getFilesCmd = vscode.commands.registerCommand('mirror-code.getFiles', async () => {
        // Get Open editors first
        const openTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
        const openFiles = new Set(
            openTabs
                .filter(t => t.input instanceof vscode.TabInputText)
                .map(t => vscode.workspace.asRelativePath((t.input as vscode.TabInputText).uri))
        );

        // Get rest of workspace files
        const files = await vscode.workspace.findFiles('**/*', '{**/node_modules/**,**/.git/**,dist/**,out/**}');
        const allFiles = files.map(f => vscode.workspace.asRelativePath(f));

        // Filter and sort: Open files first, then the rest
        const otherFiles = allFiles.filter(f => !openFiles.has(f));
        return [...Array.from(openFiles), ...otherFiles];
    });

    context.subscriptions.push(provider, getDefCmd, openTermCmd, diagCmd, symbolCmd, getFilesCmd, disposable);
}

export function deactivate() {
    if (brainProcess) {
        brainProcess.kill();
    }
}
