const express = require('express');
const { parseFile } = require('./parser');
const { indexSymbols, searchSymbols } = require('./db');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const port = 3000;

// FIX 1: Increased payload limit to 50mb to handle full codebase file reads/writes
app.use(express.json({ limit: '50mb' }));

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
        if (fs.statSync(filepath).isDirectory()) {
            return res.status(400).json({ error: 'This is a directory. Use list_dir instead to see its contents.' });
        }
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
        if (filepath.includes('..') || filepath.startsWith('/var') || filepath.startsWith('/etc')) {
             return res.status(403).json({ error: 'Access denied: Path is outside workspace or restricted.' });
        }
        if (fs.statSync(filepath).isDirectory()) {
            return res.status(400).json({ error: 'This is a directory. Use list_dir instead to see its contents.' });
        }
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

// FIX 2: Added a 30-second timeout to prevent the agent from hanging indefinitely 
// if it hallucinates an interactive command (like `npm init` or `python script_that_waits_for_input.py`)
app.post('/tools/run_terminal', async (req, res) => {
    const { command, cwd } = req.body;
    exec(command, { cwd, timeout: 30000 }, (error, stdout, stderr) => {
        res.json({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: error ? error.code : 0,
            killed: error ? error.killed : false
        });
    });
});

/**
 * Smart Diff Engine: SEARCH / REPLACE
 * FIX 3: Resilient matching to force LLM self-correction on hallucinated spaces/indentation.
 */
function applyPatch(content, blocks) {
    let result = content;
    for (const block of blocks) {
        const { search, replace } = block;
        let index = result.indexOf(search);
        
        if (index === -1) {
            // Fallback: Strip all whitespace to see if the model just messed up the indentation
            const normalize = (str) => str.replace(/\s+/g, '');
            const normalizedResult = normalize(result);
            const normalizedSearch = normalize(search);
            
            const normalizedIndex = normalizedResult.indexOf(normalizedSearch);
            if (normalizedIndex !== -1) {
                // We throw the error so it feeds back to the LLM in the chat history,
                // forcing the agent to say "Oops, I messed up the spaces. Let me try again."
                throw new Error(`Found match but whitespace differs. The LLM needs to provide exact indentation.`);
            } else {
                throw new Error(`Could not find search block in file. Ensure the <search> block exactly matches existing code.`);
            }
        }
        
        if (result.indexOf(search, index + 1) !== -1) {
            throw new Error(`Search block is ambiguous (multiple matches found). Make the <search> block larger to be specific.`);
        }
        
        result = result.substring(0, index) + replace + result.substring(index + search.length);
    }
    return result;
}

// Tool: Patch file
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
        // Send a 400 Bad Request instead of 500 when the patch fails, 
        // as this is an LLM error, not a server crash.
        res.status(400).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Mirror Code Brain listening at http://localhost:${port}`);
});