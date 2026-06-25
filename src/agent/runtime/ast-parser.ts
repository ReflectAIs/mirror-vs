export interface ParsedSymbol {
  name: string;
  type: 'class' | 'function' | 'method';
  startLine: number;
  endLine: number;
  content: string;
}

export class ASTParser {
  /**
   * Parse symbols using regex-based structural parsing.
   */
  public parseSymbols(code: string, language: string): ParsedSymbol[] {
    const symbols: ParsedSymbol[] = [];
    const lines = code.split('\n');

    const isJsTs = ['typescript', 'javascript', 'ts', 'js'].includes(language.toLowerCase());
    const isPy = ['python', 'py'].includes(language.toLowerCase());

    if (isJsTs) {
      const funcRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/;
      const classRegex = /^(?:export\s+)?class\s+(\w+)/;
      const methodRegex = /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classRegex);
        if (classMatch) {
          const name = classMatch[1];
          const end = this.findMatchingBraceEnd(lines, i);
          symbols.push({
            name,
            type: 'class',
            startLine: i + 1,
            endLine: end + 1,
            content: lines.slice(i, end + 1).join('\n'),
          });
          continue;
        }

        const funcMatch = line.match(funcRegex);
        if (funcMatch) {
          const name = funcMatch[1];
          const end = this.findMatchingBraceEnd(lines, i);
          symbols.push({
            name,
            type: 'function',
            startLine: i + 1,
            endLine: end + 1,
            content: lines.slice(i, end + 1).join('\n'),
          });
          continue;
        }

        const methodMatch = line.match(methodRegex);
        if (methodMatch) {
          const name = methodMatch[1];
          if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;
          const end = this.findMatchingBraceEnd(lines, i);
          symbols.push({
            name,
            type: 'method',
            startLine: i + 1,
            endLine: end + 1,
            content: lines.slice(i, end + 1).join('\n'),
          });
        }
      }
    } else if (isPy) {
      const defRegex = /^\s*def\s+(\w+)\s*\(/;
      const classRegex = /^\s*class\s+(\w+)/;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        const classMatch = line.match(classRegex);
        if (classMatch) {
          const name = classMatch[1];
          const end = this.findPythonBlockEnd(lines, i);
          symbols.push({
            name,
            type: 'class',
            startLine: i + 1,
            endLine: end + 1,
            content: lines.slice(i, end + 1).join('\n'),
          });
          continue;
        }

        const defMatch = line.match(defRegex);
        if (defMatch) {
          const name = defMatch[1];
          const end = this.findPythonBlockEnd(lines, i);
          symbols.push({
            name,
            type: 'function',
            startLine: i + 1,
            endLine: end + 1,
            content: lines.slice(i, end + 1).join('\n'),
          });
        }
      }
    }

    return symbols;
  }

  public replaceSymbol(code: string, symbolName: string, replacementContent: string, language: string): string {
    const symbols = this.parseSymbols(code, language);
    const target = symbols.find((s) => s.name === symbolName);
    if (!target) {
      throw new Error(`Symbol "${symbolName}" not found in code.`);
    }

    const lines = code.split('\n');
    const before = lines.slice(0, target.startLine - 1);
    const after = lines.slice(target.endLine);

    return [...before, replacementContent, ...after].join('\n');
  }

  private findMatchingBraceEnd(lines: string[], startIdx: number): number {
    let braceCount = 0;
    let foundOpen = false;

    for (let i = startIdx; i < lines.length; i++) {
      const line = lines[i];
      for (const char of line) {
        if (char === '{') {
          braceCount++;
          foundOpen = true;
        } else if (char === '}') {
          braceCount--;
        }
      }
      if (foundOpen && braceCount === 0) {
        return i;
      }
    }
    return lines.length - 1;
  }

  private findPythonBlockEnd(lines: string[], startIdx: number): number {
    const startLine = lines[startIdx];
    const indentMatch = startLine.match(/^\s*/);
    const startIndent = indentMatch ? indentMatch[0].length : 0;

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      const lineIndent = line.match(/^\s*/)?.[0].length || 0;
      if (lineIndent <= startIndent) {
        return i - 1;
      }
    }
    return lines.length - 1;
  }
}
