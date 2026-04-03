const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript').typescript;
const Python = require('tree-sitter-python');
const Go = require('tree-sitter-go');
const fs = require('fs');
const path = require('path');

const GRAMMARS = {
    '.ts': TypeScript,
    '.tsx': TypeScript,
    '.js': TypeScript,
    '.jsx': TypeScript,
    '.py': Python,
    '.go': Go
};

const parser = new Parser();

/**
 * Extracts class and function signatures from a file.
 * Returns a JSON skeleton representation.
 */
function parseFile(filepath) {
    const ext = path.extname(filepath);
    const grammar = GRAMMARS[ext];
    
    const symbols = [];
    symbols.push({ type: 'file', name: path.basename(filepath), line: 1 });

    if (!grammar) return symbols;

    try {
        const content = fs.readFileSync(filepath, 'utf8');
        parser.setLanguage(grammar);
        const tree = parser.parse(content);
        
        function traverse(node) {
            let found = null;

            // TS/JS types
            if (node.type === 'class_declaration' || node.type === 'function_declaration' || node.type === 'method_definition') {
                found = { type: node.type.includes('class') ? 'class' : 'function', name: node.childForFieldName('name') };
            } 
            // Python types
            else if (node.type === 'class_definition' || node.type === 'function_definition') {
                found = { type: node.type.includes('class') ? 'class' : 'function', name: node.childForFieldName('name') };
            }
            // Go types
            else if (node.type === 'function_declaration' || node.type === 'method_declaration') {
                found = { type: 'function', name: node.childForFieldName('name') };
            }

            if (found) {
                symbols.push({
                    type: found.type,
                    name: found.name ? found.name.text : 'anonymous',
                    line: node.startPosition.row + 1,
                    content: node.text?.substring(0, 1000) || "" // Capture up to 1000 chars of code
                });
            }

            for (let i = 0; i < node.childCount; i++) {
                traverse(node.child(i));
            }
        }
        traverse(tree.rootNode);
    } catch (e) {
        console.warn(`Could not parse AST for ${filepath}: ${e.message}`);
    }

    return symbols;
}

module.exports = { parseFile };
