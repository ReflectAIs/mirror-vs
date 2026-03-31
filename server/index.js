const express = require('express');
const { parseFile } = require('./parser');
const { indexSymbols, searchSymbols } = require('./db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const app = express();
const port = 3000;

app.use(express.json());

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', name: 'Mirror Code Brain' });
});

// Tool: Index a file
app.post('/index', async (req, res) => {
    const { filepath } = req.body;
    try {
        const symbols = parseFile(filepath);
        await indexSymbols(symbols, filepath);
        res.json({ status: 'success', count: symbols.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Get file summary (AST Skeleton)
app.post('/tools/read_skeleton', async (req, res) => {
    const { filepath } = req.body;
    try {
        const symbols = parseFile(filepath);
        res.json({ signals: symbols });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Search codebase (Vector DB)
app.post('/tools/search_vector_db', async (req, res) => {
    const { query } = req.body;
    try {
        const results = await searchSymbols(query);
        res.json({ results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Read arbitrary file
app.post('/tools/read_file', async (req, res) => {
    const { filepath } = req.body;
    try {
        const content = fs.readFileSync(filepath, 'utf8');
        res.json({ content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Write/Edit file
app.post('/tools/write_file', async (req, res) => {
    const { filepath, content } = req.body;
    try {
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filepath, content, 'utf8');
        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: List directory
app.post('/tools/list_dir', async (req, res) => {
    const { dirpath } = req.body;
    try {
        const files = fs.readdirSync(dirpath, { withFileTypes: true });
        const results = files.map(f => ({
            name: f.name,
            isDirectory: f.isDirectory()
        }));
        res.json({ files: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Run Terminal
app.post('/tools/run_terminal', async (req, res) => {
    const { command, cwd } = req.body;
    exec(command, { cwd }, (error, stdout, stderr) => {
        res.json({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? error.code : 0
        });
    });
});

/**
 * Smart Diff Engine: SEARCH / REPLACE
 */
function applyPatch(content, blocks) {
    let result = content;
    for (const block of blocks) {
        const { search, replace } = block;
        const index = result.indexOf(search);
        if (index === -1) {
            throw new Error(`Could not find search block:\n${search}`);
        }
        if (result.indexOf(search, index + 1) !== -1) {
            throw new Error(`Search block is ambiguous (multiple matches):\n${search}`);
        }
        result = result.substring(0, index) + replace + result.substring(index + search.length);
    }
    return result;
}

app.post('/tools/patch_file', async (req, res) => {
    const { filepath, blocks, previewOnly } = req.body;
    try {
        const original = fs.readFileSync(filepath, 'utf8');
        const modified = applyPatch(original, blocks);
        
        if (!previewOnly) {
            fs.writeFileSync(filepath, modified, 'utf8');
        }
        
        res.json({ 
            status: 'success', 
            content: modified,
            original: original 
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Mirror Code Brain listening at http://localhost:${port}`);
});
