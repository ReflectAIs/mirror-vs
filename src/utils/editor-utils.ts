import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Checkpoint {
  id: string;
  timestamp: number;
  filePath: string; // Absolute path to original file
  backupPath: string | null; // Path to backup file, or null if it was a new file (didn't exist)
  type: 'replace' | 'create';
}

// Global active checkpoints map to allow quick reverts via notifications
const activeCheckpoints = new Map<string, Checkpoint>();

/**
 * Creates a checkpoint for a file.
 * Returns the checkpoint ID.
 */
export async function createCheckpoint(filePath: string, type: 'replace' | 'create'): Promise<string> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceFolder) {
    throw new Error('No workspace folder open. Checkpoints cannot be created.');
  }

  const checkpointsDir = path.join(workspaceFolder, '.mirror-vs', 'checkpoints');
  if (!fs.existsSync(checkpointsDir)) {
    fs.mkdirSync(checkpointsDir, { recursive: true });
  }

  const id = `cp_${Date.now()}`;
  const fileExists = fs.existsSync(filePath);
  let backupPath: string | null = null;

  if (fileExists) {
    const fileContent = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    backupPath = path.join(checkpointsDir, `${fileName}_${id}.bak`);
    fs.writeFileSync(backupPath, fileContent);
  }

  const checkpoint: Checkpoint = {
    id,
    timestamp: Date.now(),
    filePath,
    backupPath,
    type,
  };

  activeCheckpoints.set(id, checkpoint);

  // Keep a clean checkpoints log file inside `.mirror-vs/checkpoints/manifest.json`
  const manifestPath = path.join(checkpointsDir, 'manifest.json');
  let manifest: Checkpoint[] = [];
  try {
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }
  } catch (e) {
    // Ignore reading errors
  }
  manifest.push(checkpoint);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return id;
}

/**
 * Reverts a checkpoint by its ID.
 */
export async function revertCheckpoint(id: string): Promise<boolean> {
  let checkpoint = activeCheckpoints.get(id);
  
  if (!checkpoint) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      const manifestPath = path.join(workspaceFolder, '.mirror-vs', 'checkpoints', 'manifest.json');
      try {
        if (fs.existsSync(manifestPath)) {
          const manifest: Checkpoint[] = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          const found = manifest.find(cp => cp.id === id);
          if (found) {
            checkpoint = found;
            activeCheckpoints.set(id, checkpoint);
          }
        }
      } catch (e) {
        console.error('Error loading checkpoint from manifest:', e);
      }
    }
  }

  if (!checkpoint) {
    vscode.window.showErrorMessage(`Checkpoint ${id} not found.`);
    return false;
  }

  try {
    if (checkpoint.backupPath && fs.existsSync(checkpoint.backupPath)) {
      // Restore original file
      const originalContent = fs.readFileSync(checkpoint.backupPath);
      // Ensure directory exists
      const parentDir = path.dirname(checkpoint.filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(checkpoint.filePath, originalContent);
      vscode.window.showInformationMessage(`Reverted changes to ${path.basename(checkpoint.filePath)}!`);
    } else {
      // The file was new and did not exist before this checkpoint. Delete it!
      if (fs.existsSync(checkpoint.filePath)) {
        fs.unlinkSync(checkpoint.filePath);
      }
      vscode.window.showInformationMessage(`Reverted file creation. Deleted ${path.basename(checkpoint.filePath)}!`);
    }
    
    // Remove from active list
    activeCheckpoints.delete(id);
    return true;
  } catch (error: any) {
    vscode.window.showErrorMessage(`Failed to revert checkpoint: ${error.message}`);
    return false;
  }
}

/**
 * Gets the short name of the active file in the editor.
 */
export function getActiveFileName(): string {
  let editor = vscode.window.activeTextEditor;
  if (!editor && vscode.window.visibleTextEditors.length > 0) {
    editor = vscode.window.visibleTextEditors[0];
  }
  if (!editor) {
    return '';
  }
  const doc = editor.document;
  return doc.fileName.split(/[\\/]/).pop() || doc.fileName;
}

/**
 * Retrieves the text content of the active file in the editor, truncates it if it exceeds
 * a set limit, and formats it as a markdown context prompt block.
 */
export function getActiveFileContext(maxContextLength: number = 12000): string {
  let editor = vscode.window.activeTextEditor;
  if (!editor && vscode.window.visibleTextEditors.length > 0) {
    editor = vscode.window.visibleTextEditors[0];
  }
  if (!editor) {
    return '';
  }
  
  const doc = editor.document;
  const fileName = getActiveFileName();
  const fileText = doc.getText();

  if (!fileText.trim()) {
    return ''; // Skip empty files entirely to prevent rendering empty code blocks
  }
  
  const truncatedText = fileText.length > maxContextLength
    ? fileText.substring(0, maxContextLength) + '\n\n[... content truncated due to length ...]'
    : fileText;

  const fileExt = fileName.split('.').pop() || 'plaintext';
  return `\n\n[Active File Context: ${fileName}]\n\`\`\`${fileExt}\n${truncatedText}\n\`\`\``;
}

/**
 * Writes code text to the active text editor, replacing the entire document, inserting at the cursor,
 * or creating a new file in the workspace with automatic checkpoints and revert triggers.
 */
export async function applyCodeToActiveEditor(code: string, mode: 'insert' | 'replace' | 'create'): Promise<boolean> {
  let editor = vscode.window.activeTextEditor;
  if (!editor && vscode.window.visibleTextEditors.length > 0) {
    editor = vscode.window.visibleTextEditors[0];
  }

  // Insert mode requires an open text editor
  if (mode === 'insert') {
    if (!editor) {
      vscode.window.showErrorMessage('No active file editor open! Please open a file first.');
      return false;
    }
    try {
      const success = await editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, code);
      });
      if (success) {
        vscode.window.showInformationMessage('Successfully applied code snippet at cursor!');
      }
      return success;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to apply code snippet: ${error.message}`);
      return false;
    }
  }

  // Replace mode (overwrites active document)
  if (mode === 'replace') {
    if (!editor) {
      vscode.window.showErrorMessage('No active file editor open! Please open a file first.');
      return false;
    }
    const doc = editor.document;
    const filePath = doc.fileName;

    // Create Checkpoint
    let checkpointId = '';
    try {
      checkpointId = await createCheckpoint(filePath, 'replace');
    } catch (e: any) {
      console.warn('Could not create checkpoint:', e.message);
    }

    try {
      const entireRange = new vscode.Range(
        doc.positionAt(0),
        doc.positionAt(doc.getText().length)
      );
      const success = await editor.edit((editBuilder) => {
        editBuilder.replace(entireRange, code);
      });

      if (success) {
        if (checkpointId) {
          vscode.window.showInformationMessage(
            `Successfully replaced active file contents! Checkpoint saved.`,
            'Revert'
          ).then(async (selection) => {
            if (selection === 'Revert') {
              await revertCheckpoint(checkpointId);
            }
          });
        } else {
          vscode.window.showInformationMessage('Successfully replaced active file contents!');
        }
      }
      return success;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to replace file contents: ${error.message}`);
      return false;
    }
  }

  // Create mode (creates a new file in workspace)
  if (mode === 'create') {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open! Please open a workspace first.');
      return false;
    }

    const relativePath = await vscode.window.showInputBox({
      prompt: 'Enter relative file path to create',
      placeHolder: 'e.g., src/utils/math.ts',
      value: 'src/'
    });

    if (!relativePath) {
      return false; // User cancelled
    }

    const absolutePath = path.resolve(workspaceFolder, relativePath);

    // Security check: ensure file path is inside workspace
    if (!absolutePath.startsWith(workspaceFolder)) {
      vscode.window.showErrorMessage('Security restriction: Cannot create files outside of the workspace directory.');
      return false;
    }

    // Create Checkpoint
    let checkpointId = '';
    try {
      checkpointId = await createCheckpoint(absolutePath, 'create');
    } catch (e: any) {
      console.warn('Could not create checkpoint:', e.message);
    }

    try {
      const parentDir = path.dirname(absolutePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(absolutePath, code, 'utf8');

      // Open the newly created file in the editor
      const newDoc = await vscode.workspace.openTextDocument(absolutePath);
      await vscode.window.showTextDocument(newDoc);

      if (checkpointId) {
        vscode.window.showInformationMessage(
          `Successfully created file ${path.basename(absolutePath)}! Checkpoint saved.`,
          'Revert'
        ).then(async (selection) => {
          if (selection === 'Revert') {
            await revertCheckpoint(checkpointId);
          }
        });
      } else {
        vscode.window.showInformationMessage(`Successfully created file ${path.basename(absolutePath)}!`);
      }
      return true;
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to create file: ${error.message}`);
      return false;
    }
  }

  return false;
}
