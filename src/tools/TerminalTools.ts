import { execSync } from 'child_process';

export class TerminalTools {
    /**
     * Executes a terminal command and returns truncated output.
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

        try {
            // Use a temporary wrapper to capture both stdout and stderr
            const output = execSync(`${cmd} 2>&1`, { 
                encoding: 'utf8', 
                timeout: 30000,
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
