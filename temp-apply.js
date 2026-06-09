const fs = require('fs');
const path = require('path');

// 1. Fix sidebar-provider.ts - add artifact message handlers
let sp = fs.readFileSync('d:/github/mirror-vs/src/providers/sidebar-provider.ts', 'utf8');

// Add import for ArtifactService if not present
if (!sp.includes("from '../services/artifact-service'")) {
  sp = sp.replace(
    "import { TelemetryService } from '../services/telemetry-service';",
    "import { TelemetryService } from '../services/telemetry-service';\nimport { ArtifactService } from '../services/artifact-service';"
  );
  console.log('ADDED ArtifactService import to sidebar-provider.ts');
}

// Add postToActive static property
if (!sp.includes('postToActive')) {
  sp = sp.replace(
    "public static readonly viewType = 'mirror-vs.sidebar';",
    "public static readonly viewType = 'mirror-vs.sidebar';\n  public static postToActive: ((msg: any) => void) | null = null;"
  );
  console.log('ADDED postToActive to sidebar-provider.ts');
}

// Add postToActive assignment in constructor
if (!sp.includes('MirrorVsSidebarProvider.postToActive =')) {
  sp = sp.replace(
    "this._orchestrator = new AgentOrchestrator(",
    "// Expose static post-to-active handler for plugin service and artifact notifications\n    MirrorVsSidebarProvider.postToActive = (msg: any) => {\n      this._view?.webview.postMessage(msg);\n    };\n\n    this._orchestrator = new AgentOrchestrator("
  );
  console.log('ADDED postToActive assignment in constructor');
}

// Find the clearChat case and add artifact handlers before it
if (!sp.includes("case 'getArtifacts'")) {
  sp = sp.replace(
    "case 'clearChat':",
    "case 'getArtifacts': {\n              const artifacts = ArtifactService.getInstance().artifacts;\n              this._view?.webview.postMessage({ type: 'updateArtifacts', artifacts });\n              break;\n            }\n            case 'openArtifact': {\n              ArtifactService.getInstance().openArtifactPreview(data.artifactId);\n              break;\n            }\n            case 'deleteArtifact': {\n              ArtifactService.getInstance().deleteArtifact(data.artifactId);\n              const remainingArtifacts = ArtifactService.getInstance().artifacts;\n              this._view?.webview.postMessage({ type: 'updateArtifacts', artifacts: remainingArtifacts });\n              break;\n            }\n            case 'clearChat':"
  );
  console.log('ADDED artifact message handlers');
}

fs.writeFileSync('d:/github/mirror-vs/src/providers/sidebar-provider.ts', sp, 'utf8');
console.log('SAVED sidebar-provider.ts');

// 2. Fix orchestrator-prompt.ts - add artifact section in system prompt
let op = fs.readFileSync('d:/github/mirror-vs/src/agent/orchestrator-prompt.ts', 'utf8');

if (!op.includes('create_artifact')) {
  const artifacSection = `
### 📦 Artifacts (Interactive Previews)

You can create interactive previewable artifacts that appear in a dedicated VS Code panel.
Use this to create visual content that the user can interact with:

<create_artifact type="html|svg|mermaid|code|markdown" title="Descriptive Title" [language="typescript"]>
  ...content...
</create_artifact>

Available types:
- **html**: Self-contained HTML page (with inline CSS/JS). Best for UI demos, interactive tools, visualizations.
- **svg**: SVG graphic. Best for diagrams, icons, illustrations.
- **mermaid**: Mermaid diagram (flowchart, sequence, class diagram, etc.). Best for architecture diagrams.
- **code**: Syntax-highlighted code snippet preview.
- **markdown**: Rendered markdown document.

Examples:
- "Create a beautiful HTML color picker as an artifact"
- "Create a Mermaid sequence diagram showing the payment flow"
- "Create an SVG logo for my project"

When the user asks you to create something visual, use create_artifact instead of just showing code!\n`;

  // Insert artifact section after the code analysis section and before total tokens check
  op = op.replace(
    "const totalTokens = tokensMessages + tokensContext + tokensSystem;",
    artifacSection + "\n  const totalTokens = tokensMessages + tokensContext + tokensSystem;"
  );
  console.log('ADDED artifact section to orchestrator-prompt.ts');
}

fs.writeFileSync('d:/github/mirror-vs/src/agent/orchestrator-prompt.ts', op, 'utf8');
console.log('SAVED orchestrator-prompt.ts');

// 3. Fix package.json - add commands
let pj = fs.readFileSync('d:/github/mirror-vs/package.json', 'utf8');

if (!pj.includes('mirror-vs.openArtifact')) {
  pj = pj.replace(
    `"command": "mirror-vs.refactorSelection",
        "title": "Refactor Selection with Mirror VS",
        "category": "Mirror VS"
      }`,
    `"command": "mirror-vs.refactorSelection",
        "title": "Refactor Selection with Mirror VS",
        "category": "Mirror VS"
      },
      {
        "command": "mirror-vs.openArtifact",
        "title": "Create an Artifact",
        "category": "Mirror VS"
      },
      {
        "command": "mirror-vs.listArtifacts",
        "title": "List Artifacts",
        "category": "Mirror VS"
      },
      {
        "command": "mirror-vs.createHtmlArtifact",
        "title": "Create HTML Artifact",
        "category": "Mirror VS"
      }`
  );
  console.log('ADDED artifact commands to package.json');
}

fs.writeFileSync('d:/github/mirror-vs/package.json', pj, 'utf8');
console.log('SAVED package.json');

// 4. Fix extension.ts - add artifact commands
let ext = fs.readFileSync('d:/github/mirror-vs/src/extension.ts', 'utf8');

if (!ext.includes('mirror-vs.openArtifact')) {
  ext = ext.replace(
    `context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.refactorSelection', () => {`,
    `context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.openArtifact', () => {
      vscode.commands.executeCommand('mirror-vs.focusSidebar');
      provider.handleMirrorTask('Create an interactive artifact — an HTML page, SVG graphic, Mermaid diagram, or a beautiful code snippet preview. Choose the type based on what would be most useful.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.createHtmlArtifact', () => {
      vscode.commands.executeCommand('mirror-vs.focusSidebar');
      provider.handleMirrorTask('Create an HTML artifact. This should be a self-contained interactive HTML page (with inline CSS and JS) that demonstrates something useful or beautiful.');
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.listArtifacts', () => {
      const { ArtifactService } = require('./services/artifact-service');
      const artifacts = ArtifactService.getInstance().artifacts;
      if (artifacts.length === 0) {
        vscode.window.showInformationMessage('No artifacts created yet. Ask Mirror VS to create one!');
        return;
      }
      vscode.commands.executeCommand('mirror-vs.focusSidebar');
      provider.handleMirrorTask('Current artifacts:\\n\\n' +
        artifacts.map((a, i) => \`\${i + 1}. [\${a.type}] \${a.title} (ID: \${a.id})\`).join('\\n'));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mirror-vs.refactorSelection', () => {`
  );
  console.log('ADDED artifact commands to extension.ts');
}

fs.writeFileSync('d:/github/mirror-vs/src/extension.ts', ext, 'utf8');
console.log('SAVED extension.ts');
console.log('ALL DONE');
