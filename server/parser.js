const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript').typescript;
const fs = require('fs');
const path = require('path');

const parser = new Parser();
parser.setLanguage(TypeScript);

/**
 * Extracts class and function signatures from a file.
 * Returns a JSON skeleton representation.
 */
function parseFile(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');
    const symbols = [];

    // Add generic file symbol
    symbols.push({
        type: 'file',
        name: path.basename(filepath),
        line: 1
    });

    try {
        const tree = parser.parse(content);
        function traverse(node) {
            if (node.type === 'class_declaration') {
                const nameNode = node.childForFieldName('name');
                symbols.push({
                    type: 'class',
                    name: nameNode ? nameNode.text : 'anonymous',
                    line: node.startPosition.row + 1
                });
            } else if (node.type === 'function_declaration' || node.type === 'method_definition') {
                const nameNode = node.childForFieldName('name');
                symbols.push({
                    type: 'function',
                    name: nameNode ? nameNode.text : 'anonymous',
                    line: node.startPosition.row + 1
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
