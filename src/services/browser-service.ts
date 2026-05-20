import * as puppeteer from 'puppeteer-core';
import * as fs from 'fs';

export class BrowserService {
  private static instance: BrowserService;
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;

  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  private async getChromePath(): Promise<string> {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    throw new Error('Could not find Google Chrome installation. Please ensure Chrome is installed.');
  }

  public async getPage(): Promise<puppeteer.Page> {
    if (!this.browser) {
      const executablePath = await this.getChromePath();
      this.browser = await puppeteer.launch({
        executablePath,
        headless: false, // Make it visible to the user!
        defaultViewport: { width: 1280, height: 800 },
      });
      this.browser.on('disconnected', () => {
        this.browser = null;
        this.page = null;
      });
    }

    if (!this.page || this.page.isClosed()) {
      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
    }

    return this.page;
  }

  public async navigate(url: string): Promise<string> {
    const page = await this.getPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    return `Navigated to ${url}`;
  }

  public async click(selector: string): Promise<string> {
    const page = await this.getPage();
    await page.click(selector);
    return `Clicked on ${selector}`;
  }

  public async type(selector: string, text: string): Promise<string> {
    const page = await this.getPage();
    await page.type(selector, text);
    return `Typed "${text}" into ${selector}`;
  }

  public async screenshot(): Promise<string> {
    const page = await this.getPage();
    // Return base64 encoded image
    const buffer = await page.screenshot({ type: 'png', encoding: 'base64' });
    return buffer as string;
  }

  public async close(): Promise<string> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    return 'Browser closed.';
  }
}
