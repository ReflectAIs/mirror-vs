import { ToolCall } from '../types';
import { FigmaService } from '../../services/figma-service';
import * as fs from 'fs';
import * as path from 'path';

const figmaService = new FigmaService();

export async function executeFigmaTool(tool: ToolCall, figmaKey?: string, workspacePath?: string): Promise<string> {
  if (tool.name !== 'figma_inspect') {
    throw new Error(`Unsupported Figma tool: ${tool.name}`);
  }

  if (!figmaKey) {
    throw new Error('Figma Personal Access Token is not configured. Please add it in the Mirror VS settings.');
  }

  if (!workspacePath) {
    throw new Error('No workspace folder is open. Cannot save Figma data.');
  }

  const figmaInspectRegex = /figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)\/.*?(?:\?|&)node-id=([a-zA-Z0-9\-:]+)/;
  const match = tool.url?.match(figmaInspectRegex);
  if (!match) {
    throw new Error(`Invalid Figma URL provided: ${tool.url}`);
  }

  const fileKey = match[1];
  let nodeId = match[2];

  // Figma sometimes formats node ids with hyphens in the URL (e.g. 1-2) but the API expects a colon (1:2)
  if (nodeId.includes('-') && !nodeId.includes(':')) {
    nodeId = nodeId.replace('-', ':');
  }

  try {
    const simplifiedJson = await figmaService.getSimplifiedNode(fileKey, nodeId, figmaKey);

    // Create .mirror-vs/figma directory
    const figmaDir = path.join(workspacePath, '.mirror-vs', 'figma');
    if (!fs.existsSync(figmaDir)) {
      fs.mkdirSync(figmaDir, { recursive: true });
    }

    // Save the JSON to a file
    const safeNodeId = nodeId.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${fileKey}_${safeNodeId}.json`;
    const filePath = path.join(figmaDir, fileName);
    fs.writeFileSync(filePath, simplifiedJson, 'utf8');

    return `Successfully fetched Figma node ${nodeId}.\n\nTo prevent the AI from becoming overloaded with huge amounts of text, the component tree data has been saved to: ${filePath}\n\nPlease use the \`read_file\` tool or standard file operations to read this file and analyze the design data as needed.`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch from Figma: ${message}`);
  }
}
