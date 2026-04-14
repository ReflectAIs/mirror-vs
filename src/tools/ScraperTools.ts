import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import crypto from 'crypto';

export class ScraperTools {
    /**
     * Scrapes a URL, converts the main content to Markdown, saves it to a cache file,
     * and returns a message instructing the agent to read the cache file.
     */
    static async scrapeUrl(url: string, workspaceRoot: string | undefined): Promise<string> {
        if (!workspaceRoot) {
            return `Error: Workspace root is undefined. Cannot save scraped data.`;
        }

        // --- URL Transformation Layer ---
        // Transform GitHub/GitLab blob URLs to Raw URLs to avoid JS-heavy payloads
        let targetUrl = url;
        if (url.includes('github.com') && url.includes('/blob/')) {
            targetUrl = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
        } else if (url.includes('gitlab.com') && url.includes('/blob/')) {
            targetUrl = url.replace('/blob/', '/raw/');
        }

        try {
            // Fetch HTML or Raw Data
            const response = await axios.get(targetUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/437.36'
                }
            });

            const rawData = response.data;
            
            // --- Quality Guardrails ---
            const failurePatterns = [
                /JavaScript is required/i,
                /Enable JavaScript/i,
                /Access Denied/i,
                /Please verify you are a human/i,
                /Uh oh! There was an error while loading/i
            ];

            if (typeof rawData === 'string') {
                for (const pattern of failurePatterns) {
                    if (pattern.test(rawData)) {
                        return `Error: Scrape failed for ${url}. The target site returned a JavaScript-required placeholder or access challenge. Try to find a different source or use a 'raw' documentation link.`;
                    }
                }
            }

            // If it's already markdown (common for Raw URLs), we skip cheerio
            let markdown = '';
            if (targetUrl.endsWith('.md') || (typeof rawData === 'string' && !rawData.trim().startsWith('<'))) {
                markdown = rawData;
            } else {
                const $ = cheerio.load(rawData);

                // Removing generally useless tags before markdown conversion
                $('script, style, noscript, nav, footer, header, aside, .sidebar, .menu').remove();

                // Try to find the main content area to avoid scraping headers/footers
                let contentHtml = '';
                const mainSelectors = ['main', 'article', '.content', '#content', '.main', '.post'];
                
                for (const selector of mainSelectors) {
                    const el = $(selector);
                    if (el.length > 0) {
                        contentHtml = el.html() || '';
                        break;
                    }
                }

                // Fallback to body if no semantic main tags found
                if (!contentHtml) {
                    contentHtml = $('body').html() || '';
                }

                if (!contentHtml) {
                    return `Error: Could not extract meaningful content from ${url}.`;
                }

                // --- Pre-process HTML for Turndown ---
                const content = cheerio.load(contentHtml);
                // Replace <br> with newlines explicitly inside code blocks
                content('br').replaceWith('\n');
                // Many docs use divs or spans with "line" class for syntax highlighting, causing them to merge in textContent
                content('div, .line, .token-line').append('\n');

                // Convert to Markdown
                const turndownService = new TurndownService({
                    headingStyle: 'atx',
                    codeBlockStyle: 'fenced'
                });

                // Keep pre/code formatting clean
                turndownService.addRule('pre', {
                    filter: 'pre',
                    replacement: function (contentText, node: any) {
                        const code = node.querySelector('code');
                        const language = code ? (code.className || '').replace('language-', '') : '';
                        // Some docs nest lines in divs/spans, causing turndown to group them. We appended \n above, so we clean it up here.
                        const text = node.textContent.replace(/\n{2,}/g, '\n').trim();
                        return `\n\`\`\`${language}\n${text}\n\`\`\`\n\n`;
                    }
                });

                markdown = turndownService.turndown(content.html() || contentHtml);
            }

            // Create cache directory
            const cacheDir = path.join(workspaceRoot, '.mirror', 'web_cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            // Create a safe, unique filename
            const parsedUrl = new URL(url);
            let safeName = parsedUrl.hostname.replace(/[^a-z0-9]/gi, '_') + '_' + parsedUrl.pathname.replace(/[^a-z0-9]/gi, '_');
            safeName = safeName.replace(/_+/g, '_').replace(/^_|_$/g, '');
            if (safeName.length > 50) safeName = safeName.substring(0, 50);
            
            const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 6);
            const filename = `${safeName}_${hash}.md`;
            const filepath = path.join(cacheDir, filename);

            const fileHeader = `<!-- Scraped from: ${url} -->\n# Web Scrape: ${url}\n\n`;
            fs.writeFileSync(filepath, fileHeader + markdown, 'utf8');

            const wordCount = markdown.split(/\s+/).length;

            return `✅ Successfully scraped ${url}.\n\nThe content (${wordCount} words) is too large to display directly in this result.\nIt has been saved to: ${filepath}\n\nSUGGESTION: Please use the <read_file path="${filepath.replace(/\\/g, '\\\\')}" /> tool to read the documentation carefully before writing code!`;
        } catch (error: any) {
            return `Scrape failed: ${error.message}`;
        }
    }
}
