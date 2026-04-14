import { execSync } from 'child_process';

export class TerminalTools {
    /**
     * Executes a terminal command and returns truncated output.
     */
    static runCommand(command: string, cwd?: string, maxLines: number = 30): string {
        try {
            // Use a temporary wrapper to capture both stdout and stderr
            const output = execSync(`${command} 2>&1`, { 
                encoding: 'utf8', 
                timeout: 30000,
                cwd: cwd
            });
            const lines = output.split('\n');
            
            if (lines.length > maxLines) {
                return lines.slice(0, maxLines).join('\n') + `\n\n... [OUTPUT TRUNCATED] ...`;
            }
            return output || "Command executed successfully with no output.";
        } catch (error: any) {
            const errorMsg = error.stdout || error.stderr || error.message;
            const lines = errorMsg.split('\n');
            if (lines.length > maxLines) {
                return lines.slice(0, maxLines).join('\n') + `\n\n... [ERROR TRUNCATED] ...`;
            }
            return errorMsg;
        }
    }
}
