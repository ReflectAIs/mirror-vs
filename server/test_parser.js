const Parser = require('tree-sitter');
const TypeScript = require('tree-sitter-typescript').typescript;

const parser = new Parser();
parser.setLanguage(TypeScript);

const sourceCode = `function test(a: number): string { return "hello"; }`;
const tree = parser.parse(sourceCode);

console.log('Tree-sitter successfully parsed TypeScript!');
console.log('Root node type:', tree.rootNode.type);
