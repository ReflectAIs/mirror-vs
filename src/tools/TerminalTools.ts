import { execSync } from 'child_process';
import * as vscode from 'vscode';

export class TerminalTools {
    private static activeTerminal: vscode.Terminal | undefined;

    /**
     * Executes a terminal command. Routes long-running servers to the VS Code UI.
     */
    static runCommand(command: string, cwd?: string, maxLines: number = 30): string {
        const platform = process.platform;
        let cmd = command;

        if (platform === 'win32') {
            // Translate sleep X to timeout /t X /nobreak
            cmd = cmd.replace(/\bsleep\s+(\d+)\b/g, 'timeout /t $1 /nobreak');
            // Translate ls to dir if it's the start of the command
            if (cmd.trim() === 'ls' || cmd.trim().startsWith('ls ')) {
                cmd = cmd.replace(/\bls\b/g, 'dir');
            }
        }

        // 1. Detect long-running server commands
        const isServerCommand = /\b(npm start|npm run dev|node |python -m http\.server)\b/.test(cmd);

        if (isServerCommand) {
            // Create a VS Code terminal if we don't have one, or if it was closed
            if (!this.activeTerminal || this.activeTerminal.exitStatus !== undefined) {
                this.activeTerminal = vscode.window.createTerminal("Mirror VS Server");
            }
            
            this.activeTerminal.show(); // Bring it to the front for the user
            
            // Navigate to the correct directory in the VS Code terminal
            if (cwd) {
                this.activeTerminal.sendText(`cd "${cwd}"`);
            }
            
            // Send the server command
            this.activeTerminal.sendText(cmd);
            
            // Return immediately so the agent doesn't hang!
            return `Command '${cmd}' started successfully in the VS Code Terminal. Please check the terminal window to see the server output.`;
        }

        // 2. Standard background execution for quick commands (npm install, mkdir, etc.)
        try {
            // Use a temporary wrapper to capture both stdout and stderr
            const output = execSync(`${cmd} 2>&1`, { 
                encoding: 'utf8', 
                timeout: 120000, // 2 minutes to allow npm install to finish
                cwd: cwd
            });
            const lines = output.split('\n');
            
            if (lines.length > maxLines) {
                return lines.slice(0, 10).join('\n') + 
                    `\n\n... [TRUNCATED ${lines.length - 15} LINES] ...\n\n` +
                    lines.slice(-5).join('\n');
            }
            return output || "Command executed successfully with no output.";
        } catch (error: any) {
            const errorMsg = error.stdout || error.stderr || error.message;
            const lines = errorMsg.split('\n');
            if (lines.length > maxLines) {
                return lines.slice(0, 10).join('\n') + 
                    `\n\n... [TRUNCATED ${lines.length - 15} LINES] ...\n\n` +
                    lines.slice(-5).join('\n');
            }
            return errorMsg;
        }
    }
}
