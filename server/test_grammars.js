const Parser = require('tree-sitter');
try {
    const TS = require('tree-sitter-typescript').typescript;
    const PY = require('tree-sitter-python');
    const GO = require('tree-sitter-go');
    
    console.log('TS:', typeof TS);
    console.log('PY:', typeof PY);
    console.log('GO:', typeof GO);
    
    const parser = new Parser();
    parser.setLanguage(PY);
    console.log('Successfully set Python!');
} catch (e) {
    console.error(e);
}
