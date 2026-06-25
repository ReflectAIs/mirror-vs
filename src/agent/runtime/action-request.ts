import { ActionRequest } from './types';
import * as fs from 'fs';

export class ActionRequestManager {
  /**
   * Translates incoming raw tool calls to a stable ActionRequest protocol.
   */
  public parseActionRequest(toolCall: { name: string; [key: string]: any }): ActionRequest {
    if (
      toolCall.name === 'patch_file' ||
      toolCall.name === 'multi_patch_file' ||
      toolCall.name === 'write_file' ||
      toolCall.name === 'create_file'
    ) {
      const targetPath = toolCall.path || toolCall.TargetFile;
      const strategy = this.determinePatchStrategy(targetPath, toolCall);
      return {
        type: 'MODIFY_CODE',
        targetPath,
        patchStrategy: strategy,
        details: toolCall,
      };
    }

    if (
      toolCall.name === 'read_file' ||
      toolCall.name === 'grep_search' ||
      toolCall.name === 'symbol_search' ||
      toolCall.name === 'list_dir'
    ) {
      return {
        type: 'EXPLORE',
        targetPath: toolCall.path || toolCall.SearchPath,
        details: toolCall,
      };
    }

    if (
      toolCall.name === 'run_command' ||
      toolCall.name === 'wait'
    ) {
      return {
        type: 'VERIFY',
        details: toolCall,
      };
    }

    return {
      type: 'GENERIC',
      details: toolCall,
    };
  }

  private determinePatchStrategy(filePath: string | undefined, toolCall: any): 'line' | 'symbol' | 'AST' | 'rewrite' {
    if (!filePath || !fs.existsSync(filePath)) {
      return 'rewrite';
    }

    try {
      const stats = fs.statSync(filePath);
      // Small files under 2KB are faster and more reliable to rewrite entirely
      if (stats.size < 2048) {
        return 'rewrite';
      }

      if (toolCall.symbolName) {
        return 'symbol';
      }
    } catch {
      // Ignore
    }

    return 'line';
  }
}
