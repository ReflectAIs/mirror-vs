import axios from 'axios';

export class WebSearchTools {
    private static lastSearchTime = 0;
    private static COOL_DOWN_MS = 5000; // 5 seconds cooldown

    /**
     * Searches StackOverflow via the StackExchange API (Anonymous Access).
     * This is "from scratch" and "Zero-API" in the sense that it requires no keys.
     */
    static async search(query: string): Promise<string> {
        const now = Date.now();
        if (now - this.lastSearchTime < this.COOL_DOWN_MS) {
            return `Error: Search cool-down in effect. Please wait a few seconds.`;
        }
        this.lastSearchTime = now;

        try {
            // Using the official StackExchange API which allows anonymous requests
            const url = `https://api.stackexchange.com/2.2/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow`;
            
            const response = await axios.get(url, {
                timeout: 8000,
                headers: {
                    'Accept-Encoding': 'gzip' // API requires or prefers compression
                }
            });

            const data = response.data;
            if (!data.items || data.items.length === 0) {
                return `No direct results found on StackOverflow for "${query}". Try a broader query.`;
            }

            let summary = `Top technical results for "${query}":\n\n`;
            data.items.slice(0, 3).forEach((item: any, i: number) => {
                summary += `${i + 1}. ${this.unescapeHtml(item.title)}\n   Link: ${item.link}\n   Tags: ${item.tags.join(', ')}\n\n`;
            });

            return summary;
        } catch (error: any) {
            return `Search failed: ${error.message}. Use a terminal command to check logs if this persists.`;
        }
    }

    private static unescapeHtml(text: string): string {
        return text
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
            .replace(/&apos;/g, "'");
    }
}
