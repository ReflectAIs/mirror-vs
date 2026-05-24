const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Find bindCodeBlockButtons
const bindIdx = c.indexOf('function bindCodeBlockButtons(bubbleElement)');
if (bindIdx < 0) {
  console.log('ERROR: bindCodeBlockButtons not found');
  process.exit(1);
}

// After bindCodeBlockButtons, insert the syntax highlighting function
// First find the end of bindCodeBlockButtons
const bindEnd = c.indexOf('function scrollChatToBottom', bindIdx);
if (bindEnd < 0) {
  console.log('ERROR: scrollChatToBottom not found after bindCodeBlockButtons');
  process.exit(1);
}

const syntaxHighlightCode = `
  /**
   * Lightweight syntax highlighting for code blocks.
   * Applies token-wrapping in real-time after rendering.
   */
  function applySyntaxHighlighting(container) {
    if (!container) return;
    const codeBlocks = container.querySelectorAll('pre code[class*="language-"]');
    codeBlocks.forEach((codeEl) => {
      if (codeEl.getAttribute('data-highlighted')) return;
      codeEl.setAttribute('data-highlighted', 'true');
      
      const classes = codeEl.className;
      let lang = '';
      const match = classes.match(/language-(\\w+)/);
      if (match) lang = match[1].toLowerCase();
      
      const code = codeEl.textContent || '';
      
      // Skip if code is empty or too short (< 3 chars)
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
    let lines = code.split('\\n');
    let result = [];
    
    for (let line of lines) {
      let highlighted = highlightLine(line, lang);
      result.push(highlighted);
    }
    return result.join('\\n');
  }

  function highlightLine(line, lang) {
    // Escape HTML first
    let escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Skip empty lines
    if (escaped.trim() === '') return '';
    
    // Apply regex highlighting based on language
    if (['javascript', 'typescript', 'js', 'ts'].includes(lang)) {
      // Comments (// and /* */)
      escaped = escaped.replace(/(\\/\\/.*$|\\/\\*[\\s\\S]*?\\*\\/)/g, '<span class="hljs-comment">$1</span>');
      // Strings
      escaped = escaped.replace(/(["'`])(?:(?!\\1|\\\\).|\\\\.)*\\1/g, '<span class="hljs-string">$1</span>');
      // Numbers
      escaped = escaped.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="hljs-number">$1</span>');
      // Keywords
      const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'new', 'delete', 'typeof', 'instanceof', 'this', 'super', 'class', 'extends', 'import', 'export', 'from', 'async', 'await', 'yield', 'throw', 'try', 'catch', 'finally', 'in', 'of', 'with', 'void', 'null', 'undefined', 'true', 'false', 'static', 'get', 'set'];
      const kwRegex = new RegExp('\\\\b(' + keywords.join('|') + ')\\\\b', 'g');
      escaped = escaped.replace(kwRegex, '<span class="hljs-keyword">$1</span>');
      // Function calls
      escaped = escaped.replace(/\\b([a-zA-Z_$][\\w$]*)\\s*\\(/g, '<span class="hljs-function">$1</span>(');
      // Built-in objects
      const builtins = ['console', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'Date', 'RegExp', 'Error', 'setTimeout', 'setInterval', 'fetch', 'document', 'window', 'process', 'require', 'module', 'exports', 'Buffer'];
      const biRegex = new RegExp('\\\\b(' + builtins.join('|') + ')\\\\b', 'g');
      escaped = escaped.replace(biRegex, '<span class="hljs-built_in">$1</span>');
    } else if (lang === 'python') {
      escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
      escaped = escaped.replace(/(["'])(?:(?!\\1|\\\\).|\\\\.)*\\1/g, '<span class="hljs-string">$1</span>');
      escaped = escaped.replace(/\\b(\\d+\\.?\\d*)\\b/g, '<span class="hljs-number">$1</span>');
      const pyKeywords = ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'yield', 'lambda', 'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is', 'None', 'True', 'False', 'self', 'async', 'await', 'raise'];
      const pyKwRegex = new RegExp('\\\\b(' + pyKeywords.join('|') + ')\\\\b', 'g');
      escaped = escaped.replace(pyKwRegex, '<span class="hljs-keyword">$1</span>');
    } else if (lang === 'html') {
      escaped = escaped.replace(/(&lt;\\/?[\\w-]+)/g, '<span class="hljs-tag">$1</span>');
      escaped = escaped.replace(/\\b(\\w+)(?=\\s*=)/g, '<span class="hljs-attr">$1</span>');
      escaped = escaped.replace(/("[^"]*"|'[^']*')/g, '<span class="hljs-string">$1</span>');
    } else if (lang === 'css') {
      escaped = escaped.replace(/\\.[\\w-]+|#[\\w-]+|[\\w-]+(?=\\s*{)/g, '<span class="hljs-selector">$1</span>');
      escaped = escaped.replace(/([\\w-]+)(?=\\s*:)/g, '<span class="hljs-property">$1</span>');
      escaped = escaped.replace(/(#[0-9a-fA-F]{3,6}|rgba?\\([^)]+\\))/g, '<span class="hljs-number">$1</span>');
      escaped = escaped.replace(/(["'])(?:(?!\\1|\\\\).|\\\\.)*\\1/g, '<span class="hljs-string">$1</span>');
    } else if (lang === 'json') {
      escaped = escaped.replace(/("[^"]*")(\\s*:)/g, '<span class="hljs-attr">$1</span>$2');
      escaped = escaped.replace(/("[^"]*")(?=\\s*[,}\\]])/g, '<span class="hljs-string">$1</span>');
      escaped = escaped.replace(/\\b(true|false|null)\\b/g, '<span class="hljs-literal">$1</span>');
      escaped = escaped.replace(/\\b(-?\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)\\b/g, '<span class="hljs-number">$1</span>');
    } else if (lang === 'bash' || lang === 'sh') {
      escaped = escaped.replace(/(#.*$)/g, '<span class="hljs-comment">$1</span>');
      escaped = escaped.replace(/(["'])(?:(?!\\1|\\\\).|\\\\.)*\\1/g, '<span class="hljs-string">$1</span>');
      escaped = escaped.replace(/\\b(echo|cd|ls|rm|cp|mv|mkdir|touch|cat|grep|find|npm|node|python|git|docker|sudo|export|source)\\b/g, '<span class="hljs-built_in">$1</span>');
    } else if (lang === 'diff') {
      if (escaped.startsWith('+')) escaped = '<span class="hljs-addition">' + escaped + '</span>';
      else if (escaped.startsWith('-')) escaped = '<span class="hljs-deletion">' + escaped + '</span>';
    }
    
    return escaped;
  }
`;

// Insert the syntax highlighting functions before scrollChatToBottom
const newContent = c.substring(0, bindEnd) + syntaxHighlightCode + c.substring(bindEnd);
fs.writeFileSync('src/webview/sidebar.js', newContent, 'utf8');

// Now also add a call to applySyntaxHighlighting in appendMessageBubble after bindCodeBlockButtons
// Find the call to bindCodeBlockButtons
console.log('Syntax highlighting functions inserted');

// Now patch the appendMessageBubble to call applySyntaxHighlighting
let c2 = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Find both calls to bindCodeBlockButtons and add applySyntaxHighlighting after
c2 = c2.replace(
  /bindCodeBlockButtons\(textContainer\);/g,
  'bindCodeBlockButtons(textContainer);\n      applySyntaxHighlighting(textContainer);'
);

// Also in streaming context, find the other call 
// The streaming bubble also calls bindCodeBlockButtons somewhere
c2 = c2.replace(
  /bindCodeBlockButtons\(bubble\);/g,
  'bindCodeBlockButtons(bubble);\n                applySyntaxHighlighting(bubble);'
);

fs.writeFileSync('src/webview/sidebar.js', c2, 'utf8');
console.log('applySyntaxHighlighting calls added');
console.log('File size:', fs.statSync('src/webview/sidebar.js').size);
