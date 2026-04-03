const axios = require('axios');
const fs = require('fs');

async function debugSearch() {
    const query = "latest version express knex react vite tailwind 2026";
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    
    console.log(`Searching URL: ${url}`);
    
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        
        const html = response.data;
        fs.writeFileSync('ddg_lite.html', html);
        console.log(`Saved HTML to ddg_lite.html (Length: ${html.length})`);
        
        // Test current regex
        const re = /<a class="result-link" href="([^"]+)">([\s\S]+?)<\/a>[\s\S]*?<td class="result-snippet">([\s\S]*?)<\/td>/g;
        let match;
        let count = 0;
        while ((match = re.exec(html)) !== null && count < 8) {
            console.log(`Match ${++count}: ${match[1]}`);
        }
        
        if (count === 0) {
            console.log("Main regex failed. Testing backup regex...");
            const backupRe = /<a class="result-link" href="([^"]+)">([\s\S]+?)<\/a>/g;
            while ((match = backupRe.exec(html)) !== null && count < 5) {
                console.log(`Backup Match ${++count}: ${match[1]}`);
            }
        }
    } catch (e) {
        console.error(`Search failed: ${e.message}`);
    }
}

debugSearch();
