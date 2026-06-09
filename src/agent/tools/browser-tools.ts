import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ToolCall } from '../types';
import { BrowserService } from '../../services/browser-service';

export async function executeBrowserTool(
  tool: ToolCall,
  getSafePath: (p: string) => string,
): Promise<string> {
  const browser = BrowserService.getInstance();

  switch (tool.name) {
    case 'browser_navigate': {
      if (!tool.url) throw new Error('Missing "url" attribute for browser_navigate.');
      const html = await browser.navigate(tool.url);
      return `Navigated to ${tool.url}\nPage title: ${html.title}\nText content (first 5000 chars):\n${html.textContent.substring(0, 5000)}`;
    }

    case 'browser_click': {
      if (!tool.selector) throw new Error('Missing "selector" attribute for browser_click.');
      const result = await browser.click(tool.selector);
      return result ? `Clicked element: ${tool.selector}` : `Failed to click element: ${tool.selector}`;
    }

    case 'browser_type': {
      if (!tool.selector) throw new Error('Missing "selector" attribute for browser_type.');
      if (!tool.content) throw new Error('Missing "content" (text) attribute for browser_type.');
      await browser.type(tool.selector, tool.content);
      return `Typed text into element: ${tool.selector}`;
    }

    case 'browser_screenshot': {
      const screenshot = await browser.screenshot();
      if (!screenshot) {
        return 'Screenshot failed: no page loaded. Use browser_navigate first.';
      }

      const base64 = screenshot.base64;
      const textSummary = screenshot.textContent
        ? `Page text content (first 3000 chars):\n${screenshot.textContent.substring(0, 3000)}`
        : 'No text content extracted.';

      // Optionally save screenshot to workspace for reference
      let fileSavedMsg = '';
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (workspaceFolder) {
          const screenshotDir = path.join(workspaceFolder, '.mirror-vs');
          if (!fs.existsSync(screenshotDir)) {
            fs.mkdirSync(screenshotDir, { recursive: true });
          }
          const filename = `screenshot_${Date.now()}.png`;
          const filePath = path.join(screenshotDir, filename);
          const buffer = Buffer.from(base64, 'base64');
          fs.writeFileSync(filePath, buffer);
          fileSavedMsg = `Screenshot saved to .mirror-vs/${filename}\n`;
        }
      } catch (e) {
        // Non-critical: just skip file saving
      }

      // Base64 embedded for extraction by orchestrator.ts vision pipeline.
      // Format: (Base64 data hidden from output but sent to vision model: <base64>)
      return `${fileSavedMsg}Screenshot taken successfully.
${textSummary}
(Base64 data hidden from output but sent to vision model: ${base64})`;
    }

    case 'browser_evaluate_script': {
      if (!tool.content) throw new Error('Missing "content" (script) attribute for browser_evaluate_script.');
      const result = await browser.evaluateScript(tool.content);
      return `Script executed. Result: ${JSON.stringify(result)}`;
    }

    default:
      throw new Error(`Invalid browser tool: ${tool.name}`);
  }
}
