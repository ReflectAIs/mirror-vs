// @ts-nocheck — puppeteer-core is ESM-only and requires DOM lib; esbuild compiles it fine at runtime
import * as puppeteer from 'puppeteer-core';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

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

  private logError(operation: string, error: any) {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const logDir = path.join(workspaceFolder, '.mirror-vs');
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const logFile = path.join(logDir, 'debug.log');
        const timestamp = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.stack || error.message : String(error);
        fs.appendFileSync(logFile, `[${timestamp}] [BrowserService] ${operation} failed: ${errorMessage}\n\n`);
      }
    } catch (e) {
      console.error('Failed to write debug log', e);
    }
  }

  private async getChromePath(): Promise<string> {
    const paths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    throw new Error('Could not find Google Chrome installation. Please ensure Chrome is installed.');
  }

  public async getPage(): Promise<puppeteer.Page> {
    try {
      if (!this.browser) {
        const executablePath = await this.getChromePath();
        this.browser = await puppeteer.launch({
          executablePath,
          headless: false,
          defaultViewport: { width: 1280, height: 800 },
          args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
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
    } catch (error) {
      this.logError('getPage/launch', error);
      throw error;
    }
  }

  public async navigate(url: string): Promise<string> {
    try {
      const page = await this.getPage();
      // Use 'domcontentloaded' — 'networkidle2' hangs indefinitely on dev servers
      // that maintain persistent connections (e.g. python http.server, vite HMR).
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      // Give scripts a moment to execute before reading the DOM
      await new Promise((r) => setTimeout(r, 800));
      return `Navigated to ${url}`;
    } catch (error) {
      this.logError(`navigate(${url})`, error);
      throw error;
    }
  }

  public async click(selector: string): Promise<string> {
    try {
      const page = await this.getPage();
      await page.click(selector);
      return `Clicked on ${selector}`;
    } catch (error) {
      this.logError(`click(${selector})`, error);
      throw error;
    }
  }

  public async type(selector: string, text: string): Promise<string> {
    try {
      const page = await this.getPage();
      await page.type(selector, text);
      return `Typed "${text}" into ${selector}`;
    } catch (error) {
      this.logError(`type(${selector})`, error);
      throw error;
    }
  }

  public async evaluate(script: string): Promise<string> {
    try {
      const page = await this.getPage();
      const result = await page.evaluate(script);
      return `Script executed. Result: ${JSON.stringify(result) || 'undefined'}`;
    } catch (error) {
      this.logError('evaluate', error);
      throw error;
    }
  }

  public async getPageSummary(): Promise<{
    title: string;
    url: string;
    contentText: string;
    interactiveElements: string[];
  }> {
    try {
      const page = await this.getPage();
      const title = await page.title();
      const url = page.url();

      const summary = await page.evaluate(() => {
        const elements: string[] = [];
        const interactive = document.querySelectorAll(
          'input, button, select, textarea, a, h1, h2, h3, [role="button"], [role="link"]',
        );

        interactive.forEach((el) => {
          const rect = el.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0;
          if (!isVisible) return;

          let desc = el.tagName.toLowerCase();
          if (el.id) {
            desc += `#${el.id}`;
          } else if (el.className) {
            const firstClass = el.className.trim().split(/\s+/)[0];
            if (firstClass) desc += `.${firstClass}`;
          }

          if (el instanceof HTMLInputElement) {
            desc += ` [type="${el.type || 'text'}"]`;
            if (el.placeholder) desc += ` [placeholder="${el.placeholder}"]`;
          } else if (
            el instanceof HTMLButtonElement ||
            el instanceof HTMLAnchorElement ||
            el.getAttribute('role') === 'button'
          ) {
            const text = (el.textContent || '').trim().substring(0, 30);
            if (text) desc += ` (text: "${text}")`;
          }
          elements.push(desc);
        });

        const pageText = (document.body?.innerText || '').trim();
        return {
          elements: elements.slice(0, 30),
          bodyText: pageText.substring(0, 400),
        };
      });

      return {
        title,
        url,
        contentText: summary.bodyText,
        interactiveElements: summary.elements,
      };
    } catch (error: any) {
      return {
        title: 'Error retrieving page status',
        url: '',
        contentText: `Browser page is not fully loaded or unreachable. Details: ${error.message}`,
        interactiveElements: [],
      };
    }
  }

  public async screenshot(): Promise<string> {
    try {
      const page = await this.getPage();
      // Return base64 encoded image
      const buffer = await page.screenshot({ type: 'png', encoding: 'base64' });
      return buffer as string;
    } catch (error) {
      this.logError('screenshot', error);
      throw error;
    }
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
