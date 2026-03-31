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
    // Simple filter-based search for MVP
    const results = await table
        .query()
        .where(`name LIKE '%${query}%' OR content LIKE '%${query}%'`)
        .limit(5)
        .toArray();
    return results;
}

module.exports = { indexSymbols, searchSymbols };
