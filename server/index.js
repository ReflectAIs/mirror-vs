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
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: `File not found at: ${filepath}` });
        }
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
    const { filepath, start_line, end_line } = req.body;
    try {
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: `File not found at: ${filepath}` });
        }
        if (filepath.includes('..') || filepath.startsWith('/var') || filepath.startsWith('/etc')) {
             return res.status(403).json({ error: 'Access denied: Path is outside workspace or restricted.' });
        }
        if (fs.statSync(filepath).isDirectory()) {
            return res.status(400).json({ error: 'This is a directory. Use list_dir instead to see its contents.' });
        }
        
        const fullContent = fs.readFileSync(filepath, 'utf8');
        const lines = fullContent.split('\n');
        const totalLines = lines.length;
        
        let start = parseInt(start_line) || 1;
        let end = parseInt(end_line) || totalLines;
        
        // Normalize range
        if (start < 1) start = 1;
        if (end > totalLines) end = totalLines;
        
        // If start is completely out of bounds, return empty
        if (start > totalLines) {
            return res.json({ 
                content: "",
                totalLines,
                start,
                end: totalLines,
                note: `EOF reached. Total lines in file: ${totalLines}`
            });
        }

        if (start > end) {
            return res.status(400).json({ error: `Invalid range: start_line (${start}) is greater than end_line (${end}).` });
        }

        const slicedContent = lines.slice(start - 1, end).join('\n');
        res.json({ 
            content: slicedContent,
            totalLines,
            start,
            end
        });
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
        if (!fs.existsSync(dirpath)) {
            return res.status(404).json({ error: `Directory not found at: ${dirpath}` });
        }
        
        const stats = fs.statSync(dirpath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: `Not a directory. Use <read_file filepath="${path.basename(dirpath)}" /> instead.` });
        }

        const files = fs.readdirSync(dirpath, { withFileTypes: true });
        let results = files.map(f => ({
            name: f.name,
            isDirectory: f.isDirectory()
        }));
        
        if (results.length > 50) {
            results = results.slice(0, 50);
            results.push({ name: '[Output Truncated: Use specific subdirectory or grep_search for more]', isDirectory: false });
        }
        res.json({ files: results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Grep search (Recursive literal matching)
app.post('/tools/grep_search', async (req, res) => {
    const { root, query } = req.body;
    const results = [];
    const ignore = ['node_modules', '.git', '.mirror', 'dist', 'out'];
    
    function walk(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const f of files) {
            const fullPath = path.join(dir, f.name);
            if (ignore.some(i => fullPath.includes(i))) continue;
            if (f.isDirectory()) {
                walk(fullPath);
            } else if (f.isFile()) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    if (content.toLowerCase().includes(query.toLowerCase())) {
                        const lines = content.split('\n');
                        lines.forEach((l, i) => {
                            if (l.toLowerCase().includes(query.toLowerCase())) {
                                results.push({ file: fullPath, line: i + 1, text: l.trim() });
                            }
                        });
                    }
                } catch (e) {}
            }
        }
    }

    try {
        walk(root || ".");
        res.json({ results: results.slice(0, 100) }); // Cap at 100 results for context safety
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// FIX 2: Added a 30-second timeout to prevent the agent from hanging indefinitely 
// if it hallucinates an interactive command (like `npm init` or `python script_that_waits_for_input.py`)
app.post('/tools/run_terminal', async (req, res) => {
    const { command, cwd } = req.body;
    
    // Set headers for streaming
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

    const child = spawn(shell, shellArgs, { cwd, timeout: 60000 });

    child.stdout.on('data', (data) => {
        res.write(JSON.stringify({ type: 'stdout', content: data.toString() }) + '\n');
    });

    child.stderr.on('data', (data) => {
        res.write(JSON.stringify({ type: 'stderr', content: data.toString() }) + '\n');
    });

    child.on('error', (err) => {
        res.write(JSON.stringify({ type: 'error', content: err.message }) + '\n');
    });

    child.on('close', (code) => {
        res.write(JSON.stringify({ type: 'exit', code: code || 0 }) + '\n');
        res.end();
    });
});

/**
 * Smart Diff Engine: SEARCH / REPLACE
 * FIX 3: Resilient matching to force LLM self-correction on hallucinated spaces/indentation.
 */
function applyPatch(content, blocks) {
    let result = content;
    for (const block of blocks) {
        let { search, replace } = block;
        let index = result.indexOf(search);
        
        if (index === -1) {
            // SMART FALLBACK: Normalize all whitespace to find a fuzzy match
            const normalize = (str) => str.replace(/\s+/g, ' ').trim();
            const normalizedContent = normalize(result);
            const normalizedSearch = normalize(search);
            
            const normIndex = normalizedContent.indexOf(normalizedSearch);
            if (normIndex !== -1) {
                // We found a match in normalized space. 
                // Now find the start and end in the original string.
                
                // 1. Find start: search for the first 15 non-whitespace chars of search in result 
                // near the approximate relative position.
                const searchHead = search.trim().substring(0, 15).replace(/\s+/g, '');
                let bestStartIndex = -1;
                let minDistance = Infinity;

                // Approximate location in original
                const approxPos = Math.floor((normIndex / normalizedContent.length) * result.length);
                
                // Scan around approxPos
                for (let i = Math.max(0, approxPos - 500); i < Math.min(result.length, approxPos + 500); i++) {
                    const window = result.substring(i, i + 100).replace(/\s+/g, '');
                    if (window.startsWith(searchHead)) {
                         bestStartIndex = i;
                         break;
                    }
                }

                if (bestStartIndex !== -1) {
                    // 2. Find end: consume characters until normalized matched segment equals normalizedSearch
                    let currentPos = bestStartIndex;
                    while (currentPos < result.length) {
                        if (normalize(result.substring(bestStartIndex, currentPos)) === normalizedSearch) {
                            break;
                        }
                        currentPos++;
                    }
                    index = bestStartIndex;
                    search = result.substring(bestStartIndex, currentPos);
                }
            }
        }

        if (index === -1) {
            console.error(`[PATCH ERROR] Search block not found in file.`);
            console.error(`[EXPECTED (Normalized)]:\n${search.replace(/\s+/g, ' ').trim()}`);
            throw new Error(`Could not find search block in file. Ensure the <search> block matches existing code exactly.`);
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