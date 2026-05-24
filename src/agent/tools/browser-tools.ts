
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ToolCall } from '../types';
import { BrowserService } from '../../services/browser-service';

export async function executeBrowserTool(tool: ToolCall): Promise<string> {
  const browserService = BrowserService.getInstance();

  switch (tool.name) {
    case 'browser_navigate': {
      if (!tool.url) throw new Error('Missing "url" attribute for browser_navigate.');
      const navResult = await browserService.navigate(tool.url);

      // After navigation, always return a page summary so the LLM has real DOM context
      const summary = await browserService.getPageSummary();
      const elementList =
        summary.interactiveElements.length > 0
          ? summary.interactiveElements.map((e) => `  - ${e}`).join('\n')
          : '  (no interactive elements found — page may have failed to load)';

      return `${navResult}
Page Title: "${summary.title}"
Current URL: ${summary.url}
Visible Page Text (preview): ${summary.contentText || '(empty)'}
Interactive Elements:
${elementList}`;
    }

    case 'browser_click': {
      if (!tool.selector) throw new Error('Missing "selector" attribute for browser_click.');
      const clickResult = await browserService.click(tool.selector);

      // Return a post-click page summary to confirm state change
      const summary = await browserService.getPageSummary();
      return `${clickResult}
Post-click Page Title: "${summary.title}"
Post-click Visible Text (preview): ${summary.contentText || '(empty)'}`;
    }

    case 'browser_type': {
      if (!tool.selector) throw new Error('Missing "selector" attribute for browser_type.');
      if (!tool.text) throw new Error('Missing "text" attribute for browser_type.');
      return await browserService.type(tool.selector, tool.text);
    }

    case 'browser_evaluate_script': {
      if (!tool.script) throw new Error('Missing "script" attribute for browser_evaluate_script.');
      const evalResult = await browserService.evaluate(tool.script);
      const summary = await browserService.getPageSummary();
      return `${evalResult}
Post-eval Page Title: "${summary.title}"
Post-eval Visible Text (preview): ${summary.contentText || '(empty)'}`;
    }

    case 'browser_screenshot': {
      // Capture real base64 screenshot for display in chat + vision models
      const base64 = await browserService.screenshot();

      // Store screenshot to the .mirror-vs/screenshots folder in the workspace root
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      let fileSavedMsg = '';
      if (workspaceFolder) {
        try {
          const mirrorDir = path.join(workspaceFolder, '.mirror-vs', 'screenshots');
          if (!fs.existsSync(mirrorDir)) {
            fs.mkdirSync(mirrorDir, { recursive: true });
          }
          const fileName = `screenshot_${Date.now()}.png`;
          const filePath = path.join(mirrorDir, fileName);
          fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
          fileSavedMsg = `Saved screenshot to .mirror-vs/screenshots/${fileName}\n`;
        } catch (err: any) {
          fileSavedMsg = `Failed to save screenshot to .mirror-vs/screenshots: ${err.message}\n`;
        }
      }

      // Also get DOM summary for text-only reasoning
      const summary = await browserService.getPageSummary();
      const elementList =
        summary.interactiveElements.length > 0
          ? summary.interactiveElements.map((e) => `  - ${e}`).join('\n')
          : '  (no interactive elements detected)';

      const textSummary = `Page Title: "${summary.title}"
Current URL: ${summary.url}
Visible Page Text (preview): ${summary.contentText || '(empty — page may be blank or failed to load)'}
Interactive Elements detected:
${elementList}`;

      // The orchestrator strips out the base64 and sends it as a vision attachment.
      // Format must exactly match the extraction regex in orchestrator.ts.
      return `${fileSavedMsg}Screenshot taken successfully.
${textSummary}
(Base64 data hidden from output but sent to vision model: ${base64})`;
    }

    default:
      throw new Error(`Invalid browser tool: ${tool.name}`);
  }
}
