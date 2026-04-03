const axios = require('axios');
const fs = require('fs');

async function debugMojeek() {
    const query = "latest version express knex react vite tailwind 2026";
    const url = `https://www.mojeek.com/search?q=${encodeURIComponent(query)}`;
    
    console.log(`Searching Mojeek: ${url}`);
    
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const html = response.data;
        fs.writeFileSync('mojeek_search.html', html);
        console.log(`Saved HTML to mojeek_search.html (Length: ${html.length})`);
        
        // Mojeek structure: <a href="..." class="t">Title</a> ... <p class="s">Snippet</p>
        const re = /<a href="([^"]+)" class="t">([\s\S]+?)<\/a>[\s\S]*?<p class="s">([\s\S]*?)<\/p>/g;
        let match;
        let count = 0;
        while ((match = re.exec(html)) !== null && count < 8) {
            console.log(`Match ${++count}: ${match[1]}`);
            console.log(`Title: ${match[2].replace(/<[^>]+>/g, '').trim()}`);
        }
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

debugMojeek();
