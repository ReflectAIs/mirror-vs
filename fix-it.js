
const fs = require('fs');
var c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');

var oldStartIdx = c.indexOf('private _stripCodeBlocks');
var oldEndIdx = c.indexOf('\n  }', oldStartIdx) + 4;

var before = c.substring(0, oldStartIdx - 30);
var after = c.substring(oldEndIdx);

// Build replacement using hex-encoded strings to avoid all backtick/escape issues
function esc(s) { return s.replace(/'/g, "\\'"); }

var lines = [];
lines.push('  /**');
lines.push('   * Remove fenced code blocks, inline code spans,');
lines.push('   * and HTML-escaped tool tags from the text before tool-tag scanning.');
lines.push('   * This prevents tool tags that appear inside code examples from being');
lines.push('   * mistakenly treated as real invocations.');
lines.push('   */');
lines.push('  private _stripCodeBlocks(text: string): string {');
lines.push("    // Step 1: Remove fenced code blocks (triple-backtick with optional language label)");
lines.push("    let result = text.replace(/\x60\x60\x60[\\s\\S]*?\x60\x60\x60/g, '');");
lines.push("    // Step 2: Remove inline code spans (single backtick, non-greedy)");
lines.push("    result = result.replace(/\x60[^\x60\\n]*?\x60/g, '');");
lines.push("    // Step 3: Remove HTML-escaped tool tags (e.g., &lt;read_file ... /&gt;)");
lines.push("    result = result.replace(/&lt;\\/?[a-z_]+[\\s\\S]*?\\/?&gt;/gi, '');");
lines.push('    return result;');
lines.push('  }');

var newFunc = lines.join('\n');

c = before + newFunc + after;
fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('DONE');
var nc = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var ni = nc.indexOf('private _stripCodeBlocks');
var nei = nc.indexOf('\n  }', ni) + 4;
console.log(nc.substring(ni - 30, nei));
process.exit(0);
