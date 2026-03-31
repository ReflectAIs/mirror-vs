import * as vscode from 'vscode';
import { MirrorWebviewViewProvider } from './MirrorWebviewViewProvider';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import axios from 'axios';

let brainProcess: ChildProcess | undefined;

export function activate(context: vscode.ExtensionContext) {
    const provider = new MirrorWebviewViewProvider(context.extensionUri, context);

    // 1. Launch the Brain Server
    const serverPath = path.join(context.extensionPath, 'server', 'index.js');
    brainProcess = spawn('node', [serverPath], {
        cwd: path.join(context.extensionPath, 'server'),
        stdio: 'inherit'
    });

    brainProcess.on('error', (err) => {
        console.error('Failed to start Brain server:', err);
    });

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            MirrorWebviewViewProvider.viewType,
            provider
        )
    );

    // 2. Index Workspace on Save
    const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const supported = ['typescript', 'typescriptreact', 'plaintext', 'markdown'];
        if (supported.includes(doc.languageId)) {
            try {
                await axios.post('http://localhost:3000/index', {
                    filepath: doc.uri.fsPath
                });
            } catch (e) {
                console.error('Failed to index file:', e);
            }
        }
    });

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

    context.subscriptions.push(provider, onSave, getDefCmd, openTermCmd, diagCmd, symbolCmd, disposable);
}

export function deactivate() {
    if (brainProcess) {
        brainProcess.kill();
    }
}
