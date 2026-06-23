/**
 * Artifact Tools — creates and manages interactive previewable artifacts
 * (HTML, SVG, Mermaid, code) that appear in a dedicated VS Code webview panel.
 *
 * Usage by the agent:
 *   <create_artifact type="html|svg|mermaid|code|markdown" title="My Artifact" [language="typescript"]>
 *     ...content...
 *   </create_artifact>
 */
import { ToolCall } from '../types';
import { ArtifactService } from '../../services/artifact-service';

export async function executeArtifactTool(tool: ToolCall): Promise<string> {
  const artifactService = ArtifactService.getInstance();
  const type = tool.type || tool.artifactType || 'html';
  const title = tool.title || tool.name || 'Untitled Artifact';
  const content = tool.content || tool.body || '';
  const language = tool.language || undefined;

  const id = tool.id || undefined;

  if (!content) {
    return 'Error: No content provided for the artifact. Include the content as a child element.';
  }

  const validTypes = ['html', 'svg', 'mermaid', 'code', 'markdown'];
  if (!validTypes.includes(type)) {
    return `Error: Invalid artifact type "${type}". Valid types: ${validTypes.join(', ')}`;
  }

  const artifact = id
    ? await artifactService.createOrUpdateArtifact(id, type, title, content, language, true)
    : await artifactService.createArtifact(type, title, content, language, true);

  return artifactService.formatArtifactResult(artifact);
}
