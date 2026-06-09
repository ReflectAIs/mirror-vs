/**
 * AI Review Service — Post-save auto-review of code changes.
 * Automatically analyzes file diffs on save and provides AI-powered code review.
 * Integrates with the ReviewManager for diff display and accept/reject workflows.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { ReviewManager } from './review-manager';
import { SecretService } from './secret-service';
import { estimateTokenCount } from '../agent/orchestrator-config';

export interface ReviewResult {
  filePath: string;
  issues: ReviewIssue[];
  summary: string;
  timestamp: number;
}

export interface ReviewIssue {
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  line: number;
  message: string;
  suggestion?: string;
  category: 'bug' | 'performance' | 'style' | 'security' | 'maintainability' | 'best-practice';
}

export class AiReviewService {
  private static instance: AiReviewService;
  private _enabled = false;
  private _debounceTimer: NodeJS.Timeout | null = null;
  private _reviewHistory: ReviewResult[] = [];
  private _disposables: vscode.Disposable[] = [];

  static getInstance(): AiReviewService {
    if (!AiReviewService.instance) {
      AiReviewService.instance = new AiReviewService();
    }
    return AiReviewService.instance;
  }

  /**
   * Enable post-save AI review with the given configuration.
   */
  enable(): void {
    if (this._enabled) return;
    this._enabled = true;
    this._disposables.push(
      vscode.workspace.onDidSaveTextDocument(this._onDocumentSaved.bind(this)),
    );
    vscode.window.showInformationMessage('Mirror VS: AI Code Review enabled — files will be reviewed on save.');
  }

  /**
   * Disable post-save AI review.
   */
  disable(): void {
    this._enabled = false;
    for (const d of this._disposables) {
      d.dispose();
    }
    this._disposables = [];
    vscode.window.showInformationMessage('Mirror VS: AI Code Review disabled.');
  }

  /**
   * Toggle the review service.
   */
  toggle(): boolean {
    if (this._enabled) {
      this.disable();
      return false;
    } else {
      this.enable();
      return true;
    }
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Get recent review history.
   */
  getReviewHistory(): ReviewResult[] {
    return [...this._reviewHistory];
  }

  /**
   * Clear review history.
   */
  clearHistory(): void {
    this._reviewHistory = [];
  }

  /**
   * Called when a document is saved. Debounces to avoid flooding on rapid saves.
   */
  private _onDocumentSaved(doc: vscode.TextDocument): void {
    if (!this._enabled) return;
    // Skip non-code files
    const supportedLanguages = [
      'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
      'python', 'go', 'rust', 'java', 'c', 'cpp', 'csharp',
      'ruby', 'php', 'swift', 'kotlin', 'scala', 'vue', 'svelte',
    ];
    if (!supportedLanguages.includes(doc.languageId)) return;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._reviewFile(doc);
    }, 2000);
  }

  /**
   * Perform AI review on a single file.
   */
  private async _reviewFile(doc: vscode.TextDocument): Promise<void> {
    const content = doc.getText();
    if (content.length === 0) return;

    // Check if file is too large for review
    if (estimateTokenCount(content) > 16000) {
      console.log(`Mirror VS: Skipping AI review for ${doc.fileName} — file too large.`);
      return;
    }

    // Try to get diff from git for context
    let diffContext = '';
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspaceFolder) {
        const relativePath = vscode.workspace.asRelativePath(doc.uri);
        const { execFileSync } = await import('child_process');
        diffContext = execFileSync('git', ['diff', '--', relativePath], {
          cwd: workspaceFolder,
          encoding: 'utf8',
          stdio: 'pipe',
        }).trim();
      }
    } catch {
      // No diff context available
    }

    // Build review prompt
    const prompt = this._buildReviewPrompt(content, doc.languageId, doc.fileName, diffContext);

    // Call LLM for review
    try {
      const review = await this._callLlmForReview(prompt, doc.languageId);
      if (review) {
        this._reviewHistory.unshift(review);
        // Keep only last 50 reviews
        if (this._reviewHistory.length > 50) {
          this._reviewHistory = this._reviewHistory.slice(0, 50);
        }
        this._showReviewDiagnostics(review);
      }
    } catch (err) {
      console.error('Mirror VS: AI review failed:', err);
    }
  }

  /**
   * Build the review prompt for the LLM.
   */
  private _buildReviewPrompt(content: string, language: string, fileName: string, diffContext: string): string {
    let prompt = `You are a senior code reviewer. Analyze the following ${language} code file and identify issues.

File: ${fileName}

Review for:
1. **Bugs**: Logic errors, null/undefined issues, race conditions, incorrect error handling
2. **Performance**: Inefficient algorithms, unnecessary allocations, blocking operations
3. **Security**: Injection risks, hardcoded secrets, unsafe input handling
4. **Maintainability**: Complex functions, duplicate code, unclear naming
5. **Best Practices**: Language idioms, framework conventions, type safety

`;

    if (diffContext) {
      prompt += `Recent changes (git diff):\n\`\`\`diff\n${diffContext.substring(0, 3000)}\n\`\`\`\n\n`;
    }

    prompt += `Code to review:
\`\`\`${language}
${content.substring(0, 8000)}
\`\`\`

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "summary": "Brief overall assessment (1-2 sentences)",
  "issues": [
    {
      "severity": "error|warning|info|suggestion",
      "line": <line number>,
      "message": "Description of the issue",
      "suggestion": "How to fix it (optional)",
      "category": "bug|performance|style|security|maintainability|best-practice"
    }
  ]
}

If no issues found, return: {"summary": "No issues found.", "issues": []}
Do NOT include any text before or after the JSON.`;

    return prompt;
  }

  /**
   * Call the configured LLM provider for code review.
   */
  private async _callLlmForReview(prompt: string, language: string): Promise<ReviewResult | null> {
    const config = vscode.workspace.getConfiguration('mirror-vs');
    const provider = config.get<string>('defaultProvider', 'ollama');

    let apiUrl: string;
    let model: string;
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: any;

    if (provider === 'ollama') {
      const host = config.get<string>('ollamaHost', 'http://localhost:11434');
      model = config.get<string>('defaultOllamaModel', 'llama3');
      apiUrl = `${host}/api/chat`;
      body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 },
      };
    } else if (provider === 'deepseek') {
      const secretService = SecretService.getInstance();
      const apiKey = await secretService.get('deepseek');
      if (!apiKey) return null;
      model = config.get<string>('defaultDeepSeekModel', 'deepseek-v4-pro');
      // Map local model names to API model IDs
      const modelMap: Record<string, string> = {
        'deepseek-v4-pro': 'deepseek-chat',
        'deepseek-v4-flash': 'deepseek-chat',
        'deepseek-reasoner': 'deepseek-reasoner',
        'deepseek-chat': 'deepseek-chat',
        'deepseek-coder': 'deepseek-chat',
      };
      const apiModel = modelMap[model] || 'deepseek-chat';
      apiUrl = 'https://api.deepseek.com/v1/chat/completions';
      headers['Authorization'] = `Bearer ${apiKey}`;
      body = {
        model: apiModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.3,
        max_tokens: 2048,
      };
    } else {
      // Custom endpoint
      const customEnabled = config.get<boolean>('customEndpointEnabled', false);
      if (!customEnabled) return null;
      apiUrl = config.get<string>('customEndpointUrl', 'https://api.openai.com/v1') + '/chat/completions';
      model = config.get<string>('customEndpointModel', 'gpt-4o');
      body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature: 0.3,
        max_tokens: 2048,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json() as any;
      let responseText = '';

      if (provider === 'ollama') {
        responseText = data?.message?.content || '';
      } else {
        responseText = data?.choices?.[0]?.message?.content || '';
      }

      return this._parseReviewResponse(responseText, vscode.window.activeTextEditor?.document.fileName || '');
    } catch {
      return null;
    }
  }

  /**
   * Parse the LLM response into a structured ReviewResult.
   */
  private _parseReviewResponse(responseText: string, filePath: string): ReviewResult | null {
    try {
      // Strip markdown code blocks if present
      let jsonStr = responseText.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      const parsed = JSON.parse(jsonStr);
      return {
        filePath,
        issues: parsed.issues || [],
        summary: parsed.summary || 'No issues found.',
        timestamp: Date.now(),
      };
    } catch {
      // If JSON parsing fails, return a simple result
      return {
        filePath,
        issues: [],
        summary: responseText.substring(0, 200),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Show review results as VS Code diagnostics and status bar message.
   */
  private _showReviewDiagnostics(review: ReviewResult): void {
    const errorCount = review.issues.filter((i) => i.severity === 'error').length;
    const warningCount = review.issues.filter((i) => i.severity === 'warning').length;
    const infoCount = review.issues.filter((i) => i.severity === 'info' || i.severity === 'suggestion').length;

    const total = review.issues.length;
    let message = '';

    if (total === 0) {
      message = `✅ Review: ${review.summary}`;
    } else {
      const parts: string[] = [];
      if (errorCount > 0) parts.push(`${errorCount} errors`);
      if (warningCount > 0) parts.push(`${warningCount} warnings`);
      if (infoCount > 0) parts.push(`${infoCount} suggestions`);
      message = `🔍 Review: ${parts.join(', ')} — ${review.summary.substring(0, 80)}`;
    }

    vscode.window.showInformationMessage(message, 'View Details', 'Dismiss').then((selection) => {
      if (selection === 'View Details') {
        this._showReviewPanel(review);
      }
    });
  }

  /**
   * Show a detailed review panel with all issues.
   */
  private _showReviewPanel(review: ReviewResult): void {
    const lines: string[] = [
      `# Code Review: ${review.filePath}`,
      '',
      `**Summary:** ${review.summary}`,
      '',
      '---',
      '',
    ];

    if (review.issues.length === 0) {
      lines.push('✅ No issues found.');
    } else {
      const bySeverity = (sev: string) => review.issues.filter((i) => i.severity === sev);
      const severities = ['error', 'warning', 'info', 'suggestion'] as const;
      const icons: Record<string, string> = { error: '🔴', warning: '🟡', info: '🔵', suggestion: '💡' };

      for (const sev of severities) {
        const issues = bySeverity(sev);
        if (issues.length === 0) continue;
        lines.push(`## ${icons[sev]} ${sev.charAt(0).toUpperCase() + sev.slice(1)}s (${issues.length})`, '');
        for (const issue of issues) {
          const category = issue.category ? ` [${issue.category}]` : '';
          lines.push(`- **Line ${issue.line}**${category}: ${issue.message}`);
          if (issue.suggestion) {
            lines.push(`  - *Suggestion:* ${issue.suggestion}`);
          }
        }
        lines.push('');
      }
    }

    const panel = vscode.window.createWebviewPanel(
      'mirrorReview',
      'Mirror VS Code Review',
      vscode.ViewColumn.Beside,
      { enableScripts: false },
    );
    panel.webview.html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:var(--vscode-editor-font-family);padding:20px;color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);"><div style="max-width:800px;white-space:pre-wrap;">${lines.join('\n').replace(/\n/g, '<br>')}</div></body></html>`;
  }

  /**
   * Dispose of all listeners.
   */
  dispose(): void {
    this.disable();
  }
}
