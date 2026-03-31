const lancedb = require('@lancedb/lancedb');
const path = require('path');

let db;
let table;

async function initDB() {
    if (!db) {
        db = await lancedb.connect('vector_db');
        try {
            table = await db.openTable('symbols');
        } catch (e) {
            // Create table if it doesn't exist
            // Note: LanceDB tables need initial data to define schema
            table = await db.createTable('symbols', [{ 
                name: 'init', 
                type: 'init', 
                file: 'init', 
                line: 0,
                content: 'init'
            }]);
        }
    }
    return table;
}

async function indexSymbols(symbols, filepath) {
    const table = await initDB();
    const data = symbols.map(s => ({
        name: s.name,
        type: s.type,
        file: filepath,
        line: s.line,
        content: `${s.type} ${s.name} in ${filepath}`
    }));
    
    // In a real scenario, we would add vectors here.
    // For this System 2 MVP, we'll use FTS features if available or just filtering.
    await table.add(data);
}

async function searchSymbols(query) {
    const table = await initDB();
    // Broaden search by replacing spaces with % for multi-word matching
    const sqlQuery = query.trim().replace(/\s+/g, '%');
    
    // Simple filter-based search for MVP (Case-insensitive using ILIKE)
    const results = await table
        .query()
        .where(`name ILIKE '%${sqlQuery}%' OR content ILIKE '%${sqlQuery}%'`)
        .limit(5)
        .toArray();
    return results;
}

module.exports = { indexSymbols, searchSymbols };
