import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWorkspaceContext(): string {
  let workspaceContext = "";
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    workspaceContext = "\n\n### OPEN WORKSPACE FOLDERS:\n" +
      folders.map((f, i) => `  ${i}. \`${f.uri.fsPath}\` (name: "${f.name}")`).join("\n") +
      "\n\n**Multi-Root Workspace File Rules:**\n" +
      "  - All file-related tools (read_file, create_file, write_file, patch_file, list_dir) accept **relative** or **absolute** paths.\n" +
      "  - **Absolute paths** are resolved against the matching workspace folder.\n" +
      "  - **Relative paths** are resolved against the **primary** workspace folder (index 0).\n" +
      "  - To create/write files in a non-primary folder, always use the **full absolute path** to that folder.";
      
    // Lightweight project characteristics detection
    try {
      const primaryRoot = folders[0].uri.fsPath;
      const packageJsonPath = path.join(primaryRoot, 'package.json');
      const detectedTechnologies: string[] = [];
      
      if (fs.existsSync(packageJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        
        if (deps['typescript']) detectedTechnologies.push('TypeScript');
        if (deps['react']) detectedTechnologies.push('React');
        if (deps['react-native']) detectedTechnologies.push('React Native');
        if (deps['next']) detectedTechnologies.push('Next.js');
        if (deps['vue']) detectedTechnologies.push('Vue.js');
        if (deps['vscode'] || deps['@types/vscode']) detectedTechnologies.push('VS Code Extension');
        if (deps['electron']) detectedTechnologies.push('Electron App');
        if (deps['tailwindcss']) detectedTechnologies.push('TailwindCSS');
      }
      
      if (fs.existsSync(path.join(primaryRoot, 'requirements.txt')) || fs.existsSync(path.join(primaryRoot, 'Pipfile'))) {
        detectedTechnologies.push('Python');
      }
      if (fs.existsSync(path.join(primaryRoot, 'Cargo.toml'))) {
        detectedTechnologies.push('Rust');
      }
      if (fs.existsSync(path.join(primaryRoot, 'go.mod'))) {
        detectedTechnologies.push('Go');
      }
      
      if (detectedTechnologies.length > 0) {
        workspaceContext += `\n\n### DETECTED WORKSPACE TECHNOLOGIES:\n- ${detectedTechnologies.join(', ')}`;
      }
    } catch (e) {
      // ignore silently to prevent blocking agent
    }
  } else {
    workspaceContext = "\n\n### OPEN WORKSPACE FOLDERS:\nNone";
  }

  return workspaceContext;
}
