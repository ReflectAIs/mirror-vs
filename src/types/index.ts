export type LLMProvider = 'ollama' | 'deepseek';

export interface ExtensionSettings {
  provider: LLMProvider;
  ollamaHost: string;
  defaultOllamaModel: string;
  defaultDeepSeekModel: string;
  hasDeepSeekKey: boolean; // Tells the webview if a key is stored without exposing the key itself
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Array of base64 encoded images
}

export interface ChatSession {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

// Messages sent from Webview -> Extension Host
export type WebviewToExtensionMessage =
  | { type: 'sendMessage'; text: string; history: ChatMessage[] }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; provider: LLMProvider; ollamaHost: string; defaultOllamaModel: string; defaultDeepSeekModel: string; deepSeekKey?: string }
  | { type: 'fetchModels' }
  | { type: 'applyCode'; code: string; mode: 'insert' | 'replace' | 'create' }
  | { type: 'clearChat' }
  | { type: 'newSession' }
  | { type: 'selectSession'; sessionId: string }
  | { type: 'deleteSession'; sessionId: string }
  | { type: 'revertCheckpoint'; checkpointId: string };

// Messages sent from Extension Host -> Webview
export type ExtensionToWebviewMessage =
  | { type: 'chatResponseChunk'; text: string }
  | { type: 'chatResponseComplete'; fullText: string }
  | { type: 'chatResponseError'; error: string }
  | { type: 'updateSettings'; settings: ExtensionSettings }
  | { type: 'updateModels'; models: string[] }
  | { type: 'activeFileChanged'; fileName: string }
  | { type: 'updateChatHistory'; history: ChatMessage[] }
  | { type: 'updateChatSessions'; sessions: ChatSession[]; activeSessionId: string };

