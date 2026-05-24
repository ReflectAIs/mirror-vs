const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Check drag-and-drop
const ddIdx = c.indexOf('Drag-and-Drop Image Support');
if (ddIdx >= 0) {
  console.log('DRAG-AND-DROP: Present at', ddIdx);
  console.log('Context:', c.substring(ddIdx, ddIdx + 80));
} else {
  console.log('DRAG-AND-DROP: MISSING!');
}

// Check syntax highlighting (PrismJS or similar)
const hlIdx = c.indexOf('Syntax Highlight');
const hlIdx2 = c.indexOf('hljs');
const hlIdx3 = c.indexOf('prism');
console.log('Syntax Highlighting tags:', hlIdx, hlIdx2, hlIdx3);

// Check if there are CSS files for syntax highlighting
const path = require('path');
const webviewDir = path.join(__dirname, '..', 'webview');
const files = fs.existsSync(webviewDir) ? fs.readdirSync(webviewDir) : [];
console.log('Webview files:', files);

// Check for the copy button on code blocks
const copyIdx = c.indexOf('copyCode');
console.log('Copy code button:', copyIdx >= 0 ? 'Present at ' + copyIdx : 'MISSING');

// Check test files
const testDir = path.join(__dirname, '..', '..', 'test');
const testFiles = fs.existsSync(testDir) ? 
  fs.readdirSync(testDir).filter(f => f.includes('agent') || f.includes('parser') || f.includes('orchestrat')) : 
  [];
console.log('Relevant test files:', testFiles);

// Check for test directory structure
const testsExist = fs.existsSync(testDir);
console.log('test/ directory exists:', testsExist);
if (testsExist) {
  const allTests = fs.readdirSync(testDir);
  console.log('All test files:', allTests);
  // Check if __tests__ dir exists
  const srcTests = fs.existsSync(path.join(__dirname, '..', '..', 'src', '__tests__'));
  console.log('src/__tests__ exists:', srcTests);
}
