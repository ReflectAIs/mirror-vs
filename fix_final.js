
var fs = require('fs');

// Fix orchestrator.ts: line 573 regex to match the new marker format
var c = fs.readFileSync('src/agent/orchestrator.ts', 'utf8');
var count = 0;

// Line 573: change regex to match Base64 data hidden...
var old573 = "/\\(Image successfully captured and sent to vision model)";
var new573 = "/\\(Base64 data hidden from output but sent to vision model: .*\\)/";
if (c.indexOf(old573) >= 0) {
  c = c.split(old573).join(new573);
  count++;
  console.log('Fixed line 573 regex');
}

// Line 575: change the replacement display text
var old575 = "'(Image successfully captured and sent to vision model)'";
var new575 = "'(Image successfully captured and sent to vision model)'"; // Keep same display text
// No change needed for line 575 - it already shows the clean version

// Verify line 614 is correct
var idx614 = c.indexOf('Base64 data hidden from output but sent to vision model: (.*)');
console.log('Line 614 regex correct:', idx614 >= 0);

fs.writeFileSync('src/agent/orchestrator.ts', c, 'utf8');
console.log('Done - ' + count + ' changes');
