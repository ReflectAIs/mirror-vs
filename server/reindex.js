const fs = require('fs');
const path = require('path');
const { parseFile } = require('./parser');
const { indexSymbols } = require('./db');

// Root of the workspace (parent of server/)
const workspaceRoot = path.resolve(__dirname, '..');

async function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    for (let file of list) {
        if (file === 'node_modules' || file === '.git' || file === 'vector_db') continue;
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(await walk(file));
        } else {
            if (file.endsWith('.js') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    }
    return results;
}

async function run() {
    console.log(`Searching for files in ${workspaceRoot}...`);
    const files = await walk(workspaceRoot);
    console.log(`Found ${files.length} files. Starting indexing...`);

    for (const file of files) {
        try {
            console.log(`Indexing ${path.relative(workspaceRoot, file)}...`);
            const symbols = parseFile(file);
            await indexSymbols(symbols, file);
        } catch (e) {
            console.error(`Failed to index ${file}:`, e.message);
        }
    }

    console.log('Indexing complete!');
    process.exit(0);
}

run();
