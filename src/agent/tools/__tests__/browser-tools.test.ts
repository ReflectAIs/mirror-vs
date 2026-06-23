import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { executeBrowserTool } from '../browser-tools';
import { BrowserService } from '../../../services/browser-service';

// Mock BrowserService
vi.mock('../../../services/browser-service', () => {
  const mockInstance = {
    navigate: vi.fn(),
    click: vi.fn(),
    type: vi.fn(),
    screenshot: vi.fn(),
    evaluate: vi.fn(),
  };
  return {
    BrowserService: {
      getInstance: () => mockInstance,
    },
  };
});

describe('executeBrowserTool', () => {
  const browserMock = BrowserService.getInstance() as any;
  const getSafePath = (p: string) => p;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should navigate to URL', async () => {
    browserMock.navigate.mockResolvedValue({
      title: 'Test Page',
      textContent: 'Welcome to testing',
    });

    const tool = { name: 'browser_navigate' as const, url: 'http://test.com' };
    const result = await executeBrowserTool(tool, getSafePath);

    expect(result).toContain('Navigated to http://test.com');
    expect(result).toContain('Page title: Test Page');
    expect(result).toContain('Welcome to testing');
    expect(browserMock.navigate).toHaveBeenCalledWith('http://test.com');
  });

  it('should click elements', async () => {
    browserMock.click.mockResolvedValue('Clicked');

    const tool = { name: 'browser_click' as const, selector: '#submit-btn' };
    const result = await executeBrowserTool(tool, getSafePath);

    expect(result).toContain('Clicked element: #submit-btn');
    expect(browserMock.click).toHaveBeenCalledWith('#submit-btn');
  });

  it('should type text', async () => {
    browserMock.type.mockResolvedValue('Typed');

    const tool = { name: 'browser_type' as const, selector: '#username', content: 'testuser' };
    const result = await executeBrowserTool(tool, getSafePath);

    expect(result).toContain('Typed text into element: #username');
    expect(browserMock.type).toHaveBeenCalledWith('#username', 'testuser');
  });

  it('should take screenshots', async () => {
    browserMock.screenshot.mockResolvedValue({
      base64: 'base64_data',
      textContent: 'Page visible text',
    });

    const tool = { name: 'browser_screenshot' as const };
    const result = await executeBrowserTool(tool, getSafePath);

    expect(result).toContain('Screenshot taken successfully.');
    expect(result).toContain('Page text content');
    expect(result).toContain('base64_data');
    expect(browserMock.screenshot).toHaveBeenCalled();
  });

  it('should evaluate scripts', async () => {
    browserMock.evaluate.mockResolvedValue(42);

    const tool = { name: 'browser_evaluate_script' as const, content: '2 + 2' };
    const result = await executeBrowserTool(tool, getSafePath);

    expect(result).toContain('Script executed. Result: 42');
    expect(browserMock.evaluate).toHaveBeenCalledWith('2 + 2');
  });
});
