/**
 * Lightweight syntax highlighting for code blocks.
 * Applies token-wrapping in real-time after rendering.
 */
function applySyntaxHighlighting(container) {
  if (!container) return;
  const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
  codeBlocks.forEach(function(codeEl) {
    if (codeEl.getAttribute('data-highlighted')) return;
    codeEl.setAttribute('data-highlighted', 'true');
    
    const classes = codeEl.className;
    let lang = '';
    const match = classes.match(/language-(\w+)/);
    if (match) lang = match[1].toLowerCase();
    
    const code = codeEl.textContent || '';
    
    // Skip if empty or too short
    if (code.trim().length < 3) return;
    
    const highlighted = highlightCode(code, lang);
    if (highlighted) {
      codeEl.innerHTML = highlighted;
    }
  });
}

/**
 * Simple regex-based syntax highlighter.
 * Supports: JS/TS, Python, HTML, CSS, JSON, Bash, Diff
 */
function highlightCode(code, lang) {
  var lines = code.split('\n');
  var result = [];
  
  for (var i = 0; i < lines.length; i++) {
    var hl = highlightLine(lines[i], lang);
    result.push(hl);
  }
  return result.join('\n');
}

var JS_TS_LANGS = ['javascript', 'typescript', 'js', 'ts'];

function highlightLine(line, lang) {
  // Escape HTML first
  var escaped = line
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  if (escaped.trim() === '') return '';
  
  if (JS_TS_LANGS.indexOf(lang) !== -1) {
    // Comments
    escaped = escaped.replace(/(\/\/.*$)/g, '<span class="hljs-comment">$1</span>');
    // Strings
    escaped = escaped.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>');
    // Keywords
    var kw = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'this', 'super', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'yield', 'throw', 'try', 'catch', 'finally', 'in', 'of', 'with', 'void', 'null', 'undefined', 'true', 'false', 'static', 'get', 'set'];
    var kwRegex = new RegExp('\\b(' + kw.join('|') + ')\\b', 'g');
    escaped = escaped.replace(kwRegex, '<span class="hljs-keyword">$1</span>');
    // Function calls
    escaped = escaped.replace(/\b([a-zA-Z_$][\w$]*)\s*\(/g, '<span class="hljs-function">$1</span>(');
    // Built-in objects
    var bi = ['console', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'setTimeout', 'setInterval', 'fetch', 'document', 'window', 'process', 'require', 'module', 'exports', 'Buffer', 'global'];
    var biRegex = new RegExp('\\b(' + bi.join('|') + ')\\b', 'g');
    escaped = escaped.replace(biRegex, '<span class="hljs-built_in">$1</span>');
  } else if (lang === 'python') {
    escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span class="hljs-number">$1</span>');
    var pyKw = ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await', 'raise'];
    var pyKwRegex = new RegExp('\\b(' + pyKw.join('|') + ')\\b', 'g');
    escaped = escaped.replace(pyKwRegex, '<span class="hljs-keyword">$1</span>');
  } else if (lang === 'html') {
    escaped = escaped.replace(/(&lt;\/?[\w-]+)/g, '<span class="hljs-tag">$1</span>');
    escaped = escaped.replace(/\b(\w+)(?=\s*=)/g, '<span class="hljs-attr">$1</span>');
    escaped = escaped.replace(/("[^"]*"|'[^']*')/g, '<span class="hljs-string">$1</span>');
  } else if (lang === 'css') {
    escaped = escaped.replace(/\.[\w-]+|#[\w-]+|[\w-]+(?=\s*{)/g, '<span class="hljs-selector">$1</span>');
    escaped = escaped.replace(/([\w-]+)(?=\s*:)/g, '<span class="hljs-property">$1</span>');
    escaped = escaped.replace(/(#[0-9a-fA-F]{3,6}|rgba?\([^)]+\))/g, '<span class="hljs-number">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
  } else if (lang === 'json') {
    escaped = escaped.replace(/("[^"]*")(\s*:)/g, '<span class="hljs-attr">$1</span>$2');
    escaped = escaped.replace(/("[^"]*")(?=\s*[,}\]])/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(true|false|null)\b/g, '<span class="hljs-literal">$1</span>');
    escaped = escaped.replace(/\b(-?\d+\.?\d*(?:[eE][+-]?\d+)?)\b/g, '<span class="hljs-number">$1</span>');
  } else if (lang === 'bash' || lang === 'sh') {
    escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
    escaped = escaped.replace(/(["'])(?:(?!\1|\\).|\\.)*\1/g, '<span class="hljs-string">$1</span>');
    escaped = escaped.replace(/\b(echo|cd|ls|rm|cp|mv|mkdir|touch|cat|grep|find|npm|node|python|git|docker|sudo|export|source)\b/g, '<span class="hljs-built_in">$1</span>');
  } else if (lang === 'diff') {
    if (escaped.indexOf('+') === 0) escaped = '<span class="hljs-addition">' + escaped + '</span>';
    else if (escaped.indexOf('-') === 0) escaped = '<span class="hljs-deletion">' + escaped + '</span>';
  }
  
  return escaped || '&nbsp;';
}
