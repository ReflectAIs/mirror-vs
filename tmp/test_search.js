const axios = require('axios');

async function search(q) {
  try {
    const res = await axios.get(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`);
    const html = res.data;
    console.log("HTML length:", html.length);
    // Find result links
    const matches = html.matchAll(/<a [^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
    const results = [];
    for (const m of matches) {
      results.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
    }
    console.log("Results found:", results.slice(0, 5));
    
    // Fallback: search for any result list
    if (results.length === 0) {
        console.log("No result-link class found. Trying generic search.");
        const generic = html.matchAll(/<a [^>]*rel="nofollow"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g);
        for (const m of generic) {
            if (!m[1].includes('duckduckgo.com')) {
                results.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() });
            }
        }
        console.log("Generic results:", results.slice(0, 5));
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

search("latest nodejs version");
