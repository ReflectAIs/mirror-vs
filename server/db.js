const path = require('path');

let db;
let table;
let embedder;

async function getEmbedder() {
    if (!embedder) {
        try {
            const { pipeline } = require('@xenova/transformers');
            // Use a lightweight model optimized for semantic text similarity
            embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        } catch (e) {
            console.error(`[DB ERROR] Failed to load embedder: ${e.message}`);
            throw e;
        }
    }
    return embedder;
}

async function generateEmbedding(text) {
    const pipe = await getEmbedder();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data);
}

async function initDB() {
    if (!db) {
        try {
            const lancedb = require('@lancedb/lancedb');
            db = await lancedb.connect('vector_db');
        } catch (e) {
            console.error(`[DB ERROR] Failed to connect to LanceDB: ${e.message}`);
            throw e;
        }
        try {
            table = await db.openTable('symbols');
        } catch (e) {
            // Create table with schema definition
            const initialVector = await generateEmbedding('initialization');
            table = await db.createTable('symbols', [{ 
                name: 'init', 
                type: 'init', 
                file: 'init', 
                line: 0,
                content: 'init',
                vector: initialVector
            }]);
        }
    }
    return table;
}

async function indexSymbols(symbols, filepath) {
    const table = await initDB();

    // De-duplicate: Remove existing entries for this file before adding new ones
    try {
        // Use SQL-style filter for deletion. Escape single quotes in filepath.
        const filter = `file = '${filepath.replace(/'/g, "''")}'`;
        await table.delete(filter);
    } catch (e) {
        console.warn(`[DB WARNING] De-duplication failed for ${filepath}: ${e.message}`);
    }

    const data = await Promise.all(symbols.map(async s => {
        // Use a richer representation for embedding: header + content
        const embeddingContent = `FILE: ${filepath}\nTYPE: ${s.type}\nNAME: ${s.name}\nCONTENT:\n${s.content || ''}`;
        const vector = await generateEmbedding(embeddingContent);
        return {
            name: s.name,
            type: s.type,
            file: filepath,
            line: s.line,
            content: s.content || embeddingContent, // Store the snippet itself
            vector: vector
        };
    }));
    
    await table.add(data);
    
    // Periodically optimize to reclaim space from deleted rows
    try {
        await table.optimize();
    } catch (e) {
        // Optimization might fail if concurrent operations are happening; ignore for now
    }
}

async function searchSymbols(query) {
    const table = await initDB();
    const queryVector = await generateEmbedding(query);
    
    // Semantic search using vector similarity
    const results = await table
        .vectorSearch(queryVector)
        .column('vector')
        .limit(5)
        .toArray();
        
    return results.map(r => ({
        name: r.name,
        type: r.type,
        file: r.file,
        line: r.line,
        content: r.content,
        score: r._distance // LanceDB returns distance (lower is better)
    }));
}

module.exports = { indexSymbols, searchSymbols };
