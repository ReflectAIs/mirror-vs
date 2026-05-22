
export type LLMProvider = 'ollama' | 'deepseek';

export interface ExtensionSettings {
  provider: LLMProvider;
  ollamaHost: string;
  defaultOllamaModel: string;
  defaultDeepSeekModel: string;
  hasDeepSeekKey: boolean; // Tells the webview if a key is stored without exposing the key itself
  maxTurnsBeforeSummarize: number;
  turnsToRetain: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Array of base64 encoded images
  summarized?: boolean; // Flag to exclude from LLM context while preserving in user history
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  /** Messages are NOT stored inline here — they are loaded separately via workspaceState keys */
  messages: ChatMessage[];
}

/** Lightweight session metadata (no messages) used for the sessions list sidebar */
export interface ChatSessionMeta {
  id: string;
  title: string;
  timestamp: number;
  messageCount: number;
}

export interface GitDiffLine {
  type: 'add' | 'del' | 'ctx';
  content: string;
  oldLine?: number;
  newLine?: number;
}

export interface GitFileDiff {
  file: string;
  status: string;
  hunks: {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: GitDiffLine[];
  }[];
}

// Messages sent from Webview -> Extension Host
export type WebviewToExtensionMessage =
  | { type: 'sendMessage'; text: string; history: ChatMessage[] }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; provider: LLMProvider; ollamaHost: string; defaultOllamaModel: string; defaultDeepSeekModel: string; deepSeekKey?: string; maxTurnsBeforeSummarize?: number; turnsToRetain?: number }
  | { type: 'fetchModels' }
  | { type: 'validateHost'; host: string }
  | { type: 'applyCode'; code: string; mode: 'insert' | 'replace' | 'create' }
  | { type: 'clearChat' }
  | { type: 'newSession' }
  | { type: 'selectSession'; sessionId: string }
  | { type: 'deleteSession'; sessionId: string }
  | { type: 'revertCheckpoint'; checkpointId: string }
  | { type: 'openFile'; path: string }
  | { type: 'openTerminal'; command: string; terminalName?: string }
  | { type: 'getGitStatus' }
  | { type: 'openDiff'; file: string }
  | { type: 'commitGitChanges' }
  | { type: 'getGitDiff'; file: string }
  | { type: 'applyGitDiff'; file: string; action: 'accept' | 'reject' }
  | { type: 'acceptAllReviews' };

// Messages sent from Extension Host -> Webview
export type ExtensionToWebviewMessage =
  | { type: 'chatResponseChunk'; text: string }
  | { type: 'chatResponseComplete'; fullText: string }
  | { type: 'chatResponseError'; error: string }
  | { type: 'chatResponseStart' }
  | { type: 'loopComplete' }
  | { type: 'toolStatus'; toolName: string; status: string; target: string; result?: string; checkpointId?: string; code?: string; terminalName?: string }
  | { type: 'updateSettings'; settings: ExtensionSettings }
  | { type: 'updateModels'; models: string[] }
  | { type: 'hostValidationResult'; isValid: boolean; models?: string[] }
  | { type: 'activeFileChanged'; fileName: string }
  | { type: 'updateChatHistory'; history: ChatMessage[] }
  | { type: 'updateChatSessions'; sessions: ChatSession[]; activeSessionId: string }
  | { type: 'workspaceFiles'; files: string[] }
  | { type: 'checkpointReverted'; checkpointId: string; success: boolean }
  | { type: 'screenshotCapture'; base64: string }
  | { type: 'gitChanges'; changes: { file: string; status: string }[] }
  | { type: 'cancelStream' }
  | { type: 'gitDiffContent'; file: string; diff: GitFileDiff | null }
  | { type: 'prefillPrompt'; text: string }
  | { type: 'tokenUsage'; usage: { input: number; output: number; total: number; cost: number } }
  | { type: 'activeReviewsChanged'; count: number };
