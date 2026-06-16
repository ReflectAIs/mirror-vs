/** Telemetry data for tracking usage statistics */
export interface TelemetryData {
  totalSessions: number;
  totalMessages: number;
  totalTurns: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCost: number;
  errorsByProvider: { provider: string; count: number }[];
  averageLatency: number; // ms
  topModels: { model: string; count: number }[];
  sessionHistory: {
    sessionId: string;
    title: string;
    tokensInput: number;
    tokensOutput: number;
    cost: number;
    latency: number;
    errorCount: number;
  }[];
}

export interface CustomApi {
  id: string;
  name: string;
  url: string;
  models: string[];
}

export type LLMProvider = 'ollama' | 'deepseek' | 'custom' | string;

export interface ExtensionSettings {
  provider: LLMProvider;
  ollamaHost: string;
  defaultOllamaModel: string;
  defaultDeepSeekModel: string;
  hasDeepSeekKey: boolean; // Tells the webview if a key is stored without exposing the key itself
  hasFigmaKey: boolean; // Tells the webview if a Figma PAT is stored
  contextBudgetPercent: number;
  turnsToRetain: number;
  deepSeekThinking?: boolean;
  deepSeekThinkingLevel?: 'high' | 'max';
  customEndpointEnabled?: boolean;
  customEndpointUrl?: string;
  customEndpointModel?: string;
  hasCustomEndpointKey?: boolean;
  customApis?: CustomApi[];
  configuredCustomApiKeys?: Record<string, boolean>;
  autonomousMode?: boolean;
  teacherEnabled?: boolean;
  teacherModel?: string;
  autoApproveWrite?: boolean;
  autoApproveCommand?: boolean;
  autoApproveBrowser?: boolean;
  geminiModel?: string;
  openrouterModel?: string;
  litellmEnabled?: boolean;
  litellmBaseUrl?: string;
  litellmModel?: string;
  hasGeminiKey?: boolean;
  hasOpenRouterKey?: boolean;
  hasLiteLlmKey?: boolean;
  modelContextLengths?: Record<string, number>;
  agentInputTokenBudget?: number;
  agentInputTokenHardMax?: number;
  skillsEnabled?: boolean;
  maxSkillsToKeep?: number;
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
  /** Lightweight count of messages for display in session list (not stored in session list meta) */
  messageCount?: number;
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
export interface SendMessageData {
  text: string;
  history: ChatMessage[];
  images?: string[];
  terminalName?: string;
}

export type WebviewToExtensionMessage =
  | { type: 'sendMessage'; text: string; history: ChatMessage[]; images?: string[] }
  | { type: 'getSettings' }
  | {
      type: 'saveSettings';
      provider: LLMProvider;
      ollamaHost: string;
      defaultOllamaModel: string;
      defaultDeepSeekModel: string;
      deepSeekKey?: string;
      figmaKey?: string;
      contextBudgetPercent?: number;
      turnsToRetain?: number;
      deepSeekThinking?: boolean;
      deepSeekThinkingLevel?: 'high' | 'max';
      customEndpointEnabled?: boolean;
      customEndpointUrl?: string;
      customEndpointModel?: string;
      customEndpointKey?: string;
      agentMode?: string;
      customSystemPrompt?: string;
      customApis?: CustomApi[];
      customApiKeys?: Record<string, string>;
      agentInputTokenBudget?: number;
      agentInputTokenHardMax?: number;
      skillsEnabled?: boolean;
      maxSkillsToKeep?: number;
    }
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
  | { type: 'acceptAllReviews' }
  | { type: 'cancelStream' }
  | { type: 'revertHistory'; text: string; role: string; inclusive: boolean; messageIndex?: number }
  | { type: 'acceptReview'; filePath?: string }
  | { type: 'rejectReview'; filePath?: string }
  | { type: 'diffReview'; file: string }
  | { type: 'prevChange' }
  | { type: 'nextChange' }
  | { type: 'rejectAllReviews' }
  | { type: 'getActiveReviews' }
  | { type: 'getCheckpoints' }
  | { type: 'getPromptTemplates' }
  | { type: 'createPromptTemplate' }
  | { type: 'exportTelemetryJson' }
  | { type: 'exportTelemetryCsv' }
  // New: Per-session model override
  | { type: 'setSessionModel'; sessionId: string; provider: LLMProvider; model: string }
  // New: Telemetry queries
  | { type: 'getTelemetry' }
  | { type: 'clearTelemetry' }
  // New: User feedback
  | { type: 'submitFeedback'; rating: number; comment?: string }
  // New: Retry last failed tool call
  | { type: 'retryLastToolCall'; toolName: string; target: string }
  // New: Language / locale
  | { type: 'setLocale'; locale: string }
  // Session management queries from webview
  | { type: 'getChatSessions' }
  | { type: 'getChatHistory' }
  // Workspace file requests (on-demand)
  | { type: 'requestWorkspaceFiles' }
  // Phase 1 Quick Wins message types
  | { type: 'copyToClipboard'; text: string }
  | { type: 'exportChatMarkdown' }
  | { type: 'exportChatSession' }
  | { type: 'generatePRDescription' }
  | { type: 'generateCommitMessage' }
  | { type: 'searchSessions'; query: string }
  | { type: 'showWarning'; text: string }
  | { type: 'toolApprovalResponse'; approved: boolean };

// Messages sent from Extension Host -> Webview
export type ExtensionToWebviewMessage =
  | { type: 'chatResponseChunk'; text: string; reasoningText?: string }
  | { type: 'chatResponseComplete'; fullText: string }
  | { type: 'chatResponseError'; error: string }
  | { type: 'chatResponseStart' }
  | { type: 'loopComplete' }
  | {
      type: 'toolStatus';
      toolName: string;
      status: string;
      target: string;
      result?: string;
      checkpointId?: string;
      code?: string;
      terminalName?: string;
    }
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
  | { type: 'searchSessionsResult'; matchingIds: string[]; query: string }
  | { type: 'gitDiffContent'; file: string; diff: GitFileDiff | null }
  | { type: 'prefillPrompt'; text: string }
  | { type: 'tokenUsage'; usage: { input: number; output: number; total: number; cost: number } }
  | { type: 'activeReviewsChanged'; count: number }
  // New: Per-session model info
  | { type: 'sessionModelChanged'; sessionId: string; provider: LLMProvider; model: string }
  // New: Telemetry data
  | { type: 'telemetryData'; data: TelemetryData }
  // New: Locale info
  | { type: 'localeChanged'; locale: string }
  // New: User feedback confirmation
  | { type: 'feedbackSubmitted'; success: boolean }
  // New: Provider fallback notification
  | { type: 'providerFallback'; message: string; newProvider: LLMProvider }
  | { type: 'avatarState'; state: 'idle' | 'thinking' | 'coding' | 'tool_calling' | 'error' };
