const fs = require('fs');
const c = fs.readFileSync('src/webview/sidebar.js', 'utf8');

// Find the paste event listener to add drag-and-drop right after it
const pasteIdx = c.indexOf("// Paste Event Listener for Images");
if (pasteIdx < 0) {
  console.log('ERROR: Could not find paste event listener');
  process.exit(1);
}

// Find the end of the paste listener
const afterPaste = c.indexOf("function attachImage", pasteIdx);
if (afterPaste < 0) {
  console.log('ERROR: Could not find attachImage function');
  process.exit(1);
}

// The drag-and-drop code to insert before attachImage
const dragDropCode = `
  // Drag-and-Drop Image Support
  promptInput.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '#a855f7';
    promptInput.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.3)';
  });

  promptInput.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '';
    promptInput.style.boxShadow = '';
  });

  promptInput.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    promptInput.style.borderColor = '';
    promptInput.style.boxShadow = '';
    
    const files = e.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) {
        const reader = new FileReader();
        reader.onload = function(event) {
          const base64 = event.target.result.split(',')[1];
          attachImage(base64);
        };
        reader.readAsDataURL(files[i]);
      }
    }
  });

`;

const newContent = c.substring(0, afterPaste) + dragDropCode + c.substring(afterPaste);
fs.writeFileSync('src/webview/sidebar.js', newContent, 'utf8');
console.log('Drag-and-drop support added successfully!');
