import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function getWorkspaceContext(): string {
  const folders = vscode.workspace.workspaceFolders;

  if (!folders || folders.length === 0) {
    return '\n\nOPEN WORKSPACE FOLDERS\nNone';
  }

  let context = '\n\nOPEN WORKSPACE FOLDERS\n';
  context += folders.map((f, i) => `${i}. ${f.uri.fsPath} (name: "${f.name}")`).join('\n');

  context +=
    '\n\nMULTI-ROOT WORKSPACE RULES\n' +
    '- File tools accept relative or absolute paths.\n' +
    '- Absolute paths are resolved against the matching workspace folder.\n' +
    '- Relative paths are resolved against the primary workspace folder (index 0).\n' +
    '- To create or write files in a non-primary folder, use the full absolute path.';

  try {
    const primaryRoot = folders[0].uri.fsPath;
    const packageJsonPath = path.join(primaryRoot, 'package.json');
    const detectedTechnologies: string[] = [];

    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (deps.typescript) detectedTechnologies.push('TypeScript');
      if (deps.react) detectedTechnologies.push('React');
      if (deps['react-native']) detectedTechnologies.push('React Native');
      if (deps.next) detectedTechnologies.push('Next.js');
      if (deps.vue) detectedTechnologies.push('Vue.js');
      if (deps.vscode || deps['@types/vscode']) detectedTechnologies.push('VS Code Extension');
      if (deps.electron) detectedTechnologies.push('Electron App');
      if (deps.tailwindcss) detectedTechnologies.push('TailwindCSS');
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
      context += `\n\nDETECTED WORKSPACE TECHNOLOGIES\n${detectedTechnologies.join(', ')}`;
    }
  } catch {
    // Ignore errors so context generation never blocks the agent.
  }

  return context;
}
