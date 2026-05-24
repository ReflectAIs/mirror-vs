
const fs = require('fs');
const content = fs.readFileSync('src/agent/tools/browser-tools.ts', 'utf8');
// Find the screenshot case
const idx = content.indexOf("browser_screenshot");
if (idx !== -1) {
  const relevant = content.substring(idx, idx + 400);
  console.log("=== RAW SCREENSHOT CASE (bytes) ===");
  // Print each character with its char code
  for (let i = 0; i < relevant.length; i++) {
    const ch = relevant[i];
    const code = relevant.charCodeAt(i);
    if (code > 127 || code < 32) {
      process.stdout.write(`[${code}]`);
    } else {
      process.stdout.write(ch);
    }
  }
  console.log("\n\n=== END ===");
  // Now find the line "image successfully"
  const img = relevant.indexOf("image");
  console.log("\nimage at relative index", img);
  if (img !== -1) {
    console.log("Context around image:", JSON.stringify(relevant.substring(img - 20, img + 80)));
  }
}
