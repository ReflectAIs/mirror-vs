const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { exec, spawn } = require('child_process');

let dbModule; // Late-loaded

// Global Exception Handlers
process.on('uncaughtException', (err) => {
    console.error(`[FATAL] Uncaught Exception: ${err.message}\n${err.stack}`);
    // Keep alive if possible, or exit gracefully
});

process.on('unhandledRejection', (reason, promise) => {
    console.error(`[FATAL] Unhandled Rejection at:`, promise, `reason:`, reason);
});

const app = express();
const port = 3000;

// Increased payload limit to 50mb to handle full codebase file reads/writes
app.use(express.json({ limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Request validation middleware
app.use((req, res, next) => {
    if (req.method === 'POST' && (!req.body || Object.keys(req.body).length === 0)) {
        return res.status(400).json({ error: 'Request body is required.' });
    }
    next();
});

// Path safety helper — validates paths don't escape workspace
function validatePath(filepath) {
    if (!filepath || typeof filepath !== 'string') return false;
    // Block null bytes
    if (filepath.includes('\0')) return false;
    // Block absolute paths to sensitive system directories
    const dangerous = ['/etc/', '/var/', '/root/', '/proc/', '/sys/', 'C:\\Windows', 'C:\\Program'];
    for (const d of dangerous) {
        if (filepath.toLowerCase().startsWith(d.toLowerCase())) return false;
    }
    return true;
}

// Basic health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', name: 'Mirror Code Brain' });
});

// Tool: Index a file
app.post('/index', async (req, res) => {
    const { filepath } = req.body;
    try {
        const { parseFile } = require('./parser');
        if (!dbModule) dbModule = require('./db');
        
        const symbols = parseFile(filepath);
        await dbModule.indexSymbols(symbols, filepath);
        res.json({ status: 'success', count: symbols.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Get file summary (AST Skeleton)
app.post('/tools/read_skeleton', async (req, res) => {
    const { filepath } = req.body;
    try {
        const { parseFile } = require('./parser');
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
        if (!dbModule) dbModule = require('./db');
        const results = await dbModule.searchSymbols(query);
        res.json({ results });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Read arbitrary file
app.post('/tools/read_file', async (req, res) => {
    const { filepath, start_line, end_line } = req.body;
    try {
        if (!validatePath(filepath)) {
            return res.status(403).json({ error: 'Invalid or restricted path.' });
        }
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
        if (!validatePath(filepath)) {
            return res.status(403).json({ error: 'Invalid or restricted path.' });
        }
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

// Tool: Web Search (Scraping Mojeek for resiliency)
app.post('/tools/search_web', async (req, res) => {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required.' });

    // Specialized Logic: If query looks like a version check, hit NPM registry directly
    const versionMatch = query.match(/latest version of ([a-z0-9\-@\/]+)/i) || query.match(/version ([a-z0-9\-@\/]+)/i);
    if (versionMatch) {
        try {
            const pkg = versionMatch[1];
            const npmRes = await axios.get(`https://registry.npmjs.org/${pkg}/latest`);
            return res.json({ results: [{
                url: `https://www.npmjs.com/package/${pkg}`,
                title: `NPM Registry: ${pkg} v${npmRes.data.version}`,
                snippet: `${npmRes.data.description || "No description."} Fixed Version: ${npmRes.data.version}`
            }] });
        } catch (e) {
            // Fallback to normal search if NPM fails
        }
    }

    try {
        const response = await axios.get(`https://www.mojeek.com/search?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const html = response.data;
        const results = [];
        
        // Mojeek structure: <a class="title" [^>]*href="([^"]+)"[^>]*>([\s\S]+?)<\/a>[\s\S]*?<p class="s">([\s\S]*?)<\/p>
        const re = /<a class="title" [^>]*href="([^"]+)"[^>]*>([\s\S]+?)<\/a>[\s\S]*?<p class="s">([\s\S]*?)<\/p>/g;
        let match;
        while ((match = re.exec(html)) !== null && results.length < 8) {
            results.push({
                url: match[1],
                title: match[2].replace(/<[^>]+>/g, '').trim(),
                snippet: match[3].replace(/<[^>]+>/g, '').trim()
            });
        }

        if (results.length === 0) {
            // Backup match for title only if snippet structure differs
            const backupRe = /<a class="title" [^>]*href="([^"]+)"[^>]*>([\s\S]+?)<\/a>/g;
            while ((match = backupRe.exec(html)) !== null && results.length < 5) {
                results.push({
                    url: match[1],
                    title: match[2].replace(/<[^>]+>/g, '').trim(),
                    snippet: "No snippet found."
                });
            }
        }

        res.json({ results });
    } catch (e) {
        // Fallback: Try DuckDuckGo Lite
        try {
            const ddgRes = await axios.get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const ddgHtml = ddgRes.data;
            const ddgResults = [];
            const ddgRe = /<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>/g;
            let ddgMatch;
            while ((ddgMatch = ddgRe.exec(ddgHtml)) !== null && ddgResults.length < 5) {
                ddgResults.push({
                    url: ddgMatch[1],
                    title: ddgMatch[2].replace(/<[^>]+>/g, '').trim(),
                    snippet: 'No snippet (fallback search)'
                });
            }
            if (ddgResults.length > 0) {
                return res.json({ results: ddgResults });
            }
        } catch (e2) { }
        
        res.status(500).json({ error: `Search failed: ${e.message}` });
    }
});

// Terminal: Buffered execution with 30s timeout. Returns JSON, not NDJSON streaming.
app.post('/tools/run_terminal', async (req, res) => {
    const { command, cwd } = req.body;
    if (!command) {
        return res.status(400).json({ error: 'Missing required field: command' });
    }

    const timeout = 30000; // 30 seconds
    const options = { cwd: cwd || process.cwd(), timeout, maxBuffer: 1024 * 1024 * 5 }; // 5MB buffer

    try {
        exec(command, options, (error, stdout, stderr) => {
            const output = {
                stdout: stdout ? stdout.substring(0, 50000) : '',  // Cap at 50k chars
                stderr: stderr ? stderr.substring(0, 20000) : '',
                exitCode: error ? (error.code || 1) : 0,
                timedOut: error && error.killed ? true : false
            };
            
            if (output.timedOut) {
                output.stderr += '\n[MIRROR: Command timed out after 30 seconds. Use a shorter command or check if it requires interactive input.]';
            }
            
            res.json(output);
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Tool: Simple search and replace in a file
app.post('/tools/search_and_replace', async (req, res) => {
    const { filepath, search, replace, replaceAll } = req.body;
    if (!filepath || search === undefined || replace === undefined) {
        return res.status(400).json({ error: 'Missing required fields: filepath, search, replace' });
    }
    try {
        if (!fs.existsSync(filepath)) {
            return res.status(404).json({ error: `File not found: ${filepath}` });
        }
        const content = fs.readFileSync(filepath, 'utf8');
        const count = content.split(search).length - 1;
        if (count === 0) {
            return res.status(400).json({ error: 'Search string not found in file.' });
        }
        const result = replaceAll ? content.replaceAll(search, replace) : content.replace(search, replace);
        fs.writeFileSync(filepath, result, 'utf8');
        res.json({ status: 'success', matchesFound: count, matchesReplaced: replaceAll ? count : 1 });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

/**
 * Smart Diff Engine: SEARCH / REPLACE
 * FIX 3: Resilient matching to force LLM self-correction on hallucinated spaces/indentation.
 */
function applyPatch(content, blocks) {
    console.log(`[PATCH] Applying ${blocks.length} block(s)...`);
    let result = content;
    for (const block of blocks) {
        let { search, replace } = block;
        let index = result.indexOf(search);
        
        if (index === -1) {
            console.log(`[PATCH] Exact match failed for block. Attempting fuzzy match...`);
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
        console.error(`[PATCH ERROR] ${e.message}`);
        // Send a 400 Bad Request instead of 500 when the patch fails, 
        // as this is an LLM error, not a server crash.
        res.status(400).json({ error: e.message });
    }
});

// Tool: Update Mirror Plan
app.post('/tools/update_plan', async (req, res) => {
    const { rootPath, name, status, newTasks } = req.body;
    try {
        const { updateTask } = require('./planner');
        const result = updateTask(rootPath, name, status, newTasks);
        res.json({ status: 'success', result });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => {
    console.log(`Mirror Code Brain listening at http://localhost:${port}`);
});