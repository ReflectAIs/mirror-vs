const lancedb = require('@lancedb/lancedb');

async function test() {
    const db = await lancedb.connect('vector_db');
    console.log('LanceDB successfully connected!');
}

test().catch(console.error);
