import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';

export class WebSearchTools {
    private static lastSearchTime = 0;
    private static COOL_DOWN_MS = 3000; // 3 seconds cooldown for DDG Lite

    /**
     * Searches the web using DuckDuckGo Lite (Anonymous Access).
     * Results are cached to .mirror/web_cache for persistence.
     */
    static async search(query: string, workspaceRoot?: string): Promise<string> {
        const now = Date.now();
        if (now - this.lastSearchTime < this.COOL_DOWN_MS) {
            return `Error: Search cool-down in effect. Please wait a few seconds.`;
        }
        this.lastSearchTime = now;

        try {
            const response = await axios.post('https://lite.duckduckgo.com/lite/', `q=${encodeURIComponent(query)}`, {
                timeout: 8000,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const html = response.data;
            const linkRegex = /<a rel="nofollow" href="([^"]+)".*?>([\s\S]*?)<\/a>/g;
            let match;
            const results = [];
            while ((match = linkRegex.exec(html)) !== null) {
                const title = match[2].replace(/<\/?[^>]+(>|$)/g, "").trim();
                const link = match[1];
                if (!link.includes('duckduckgo.com') && title.length > 0) {
                    results.push({ link, title });
                }
            }

            if (results.length === 0) {
                return `No web results found for "${query}". Try a broader query.`;
            }

            let summary = `Top web search results for "${query}":\n\n`;
            results.slice(0, 5).forEach((item, i) => {
                summary += `${i + 1}. **${item.title}**\n   URL: ${item.link}\n\n`;
            });

            summary += `SUGGESTION: If one of these URLs looks like official documentation or a helpful guide, use the <read_url url="..." /> tool to scrape its detailed contents!`;

            // --- Cache Persistence Layer ---
            if (workspaceRoot) {
                try {
                    const cacheDir = path.join(workspaceRoot, '.mirror', 'web_cache');
                    if (!fs.existsSync(cacheDir)) {
                        fs.mkdirSync(cacheDir, { recursive: true });
                    }

                    // Create a safe filename from the query
                    const safeQuery = query.toLowerCase().replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').substring(0, 40);
                    const hash = crypto.createHash('md5').update(query).digest('hex').substring(0, 6);
                    const filename = `search_${safeQuery}_${hash}.md`;
                    const filepath = path.join(cacheDir, filename);

                    const fileContent = `<!-- Search Query: ${query} -->\n# Web Search Results: ${query}\n\n${summary}`;
                    fs.writeFileSync(filepath, fileContent, 'utf8');
                    
                    summary += `\n\n✅ Results cached to: ${filepath}`;
                } catch (cacheError) {
                    console.error(`[WebSearchTools] Caching failed:`, cacheError);
                }
            }

            return summary;
        } catch (error: any) {
            return `Search failed: ${error.message}.`;
        }
    }
}
