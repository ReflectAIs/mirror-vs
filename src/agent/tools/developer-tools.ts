import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ToolCall } from '../types';

export async function executeDeveloperTool(tool: ToolCall): Promise<string> {
  const name = tool.name;

  if (name === 'python_eval') {
    const code = tool.code || tool.content || '';
    if (!code) {
      throw new Error('Missing "code" attribute for python_eval.');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();

    return new Promise((resolve) => {
      // Find suitable python command (python3 or python)
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
      
      const child = exec(pythonCmd, { cwd }, (error, stdout, stderr) => {
        if (error) {
          resolve(`Error executing Python code: ${error.message}\nStderr: ${stderr}\nStdout: ${stdout}`);
        } else {
          resolve(stdout || stderr || 'Python code executed successfully with no output.');
        }
      });

      if (child.stdin) {
        child.stdin.write(code);
        child.stdin.end();
      }
    });
  }

  if (name === 'ast_grep') {
    const query = tool.query || tool.pattern || tool.content || '';
    if (!query) {
      throw new Error('Missing "query" or "pattern" attribute for ast_grep.');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open for ast_grep.');
    }
    const cwd = workspaceFolders[0].uri.fsPath;

    return new Promise((resolve) => {
      const command = `npx ast-grep run --pattern "${query.replace(/"/g, '\\"')}"`;
      exec(command, { cwd }, (error, stdout, stderr) => {
        if (error) {
          resolve(`ast-grep returned an error or no matches: ${error.message}\n${stderr || stdout}`);
        } else {
          resolve(stdout || 'No matches found by ast-grep.');
        }
      });
    });
  }

  if (name === 'lint_fix') {
    const targetPath = tool.path || tool.target || '';
    if (!targetPath) {
      throw new Error('Missing "path" attribute for lint_fix.');
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open for lint_fix.');
    }
    const cwd = workspaceFolders[0].uri.fsPath;
    const absolutePath = path.isAbsolute(targetPath) ? targetPath : path.join(cwd, targetPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Target file does not exist: ${targetPath}`);
    }

    return new Promise((resolve) => {
      // Run eslint --fix or prettier --write depending on file type
      const ext = path.extname(absolutePath).toLowerCase();
      let cmd = `npx prettier --write "${absolutePath}"`;
      if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
        cmd = `npx eslint --fix "${absolutePath}" || npx prettier --write "${absolutePath}"`;
      }

      exec(cmd, { cwd }, (error, stdout, stderr) => {
        if (error) {
          resolve(`Lint/format finished with notice: ${error.message}\n${stdout || stderr}`);
        } else {
          resolve(`✅ Successfully ran linter/formatter on ${targetPath}.\n${stdout}`);
        }
      });
    });
  }

  throw new Error(`Invalid developer tool: ${name}`);
}
