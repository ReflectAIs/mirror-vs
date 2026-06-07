import * as vscode from 'vscode';
import { ChatMessage, LLMProvider } from '../types';
import { executeTool } from './tools/tool-registry';
import { CommandService } from '../services/command-service';
import { RateLimiter } from '../services/rate-limiter';
import { ProviderFallback } from '../services/provider-fallback';
import { AgentSession } from './agent-session';
import { AgentParser } from './agent-parser';
import { AgentCompleter } from './agent-completer';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/** Model context window sizes in tokens. Used for token-budget-based summarization. */
const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'deepseek-chat': 64000,
  'deepseek-reasoner': 64000,
  'deepseek-v4-flash': 128000, // Capped at 64K for cost-effectiveness
  'deepseek-v4-pro': 128000, // Capped at 64K for cost-effectiveness
  llama3: 8192,
  'llama3.1': 131072,
  'llama3.2': 131072,
  'qwen2.5-coder:32b': 131072,
  'qwen2.5-coder:14b': 131072,
  'qwen2.5-coder:7b': 32768,
  codestral: 32768,
  mistral: 32768,
  gemma2: 8192,
  phi3: 4096,
};

export function getModelContextWindow(model: string): number {
  const normalized = model.toLowerCase();
  if (MODEL_CONTEXT_WINDOWS[model]) return MODEL_CONTEXT_WINDOWS[model];
  if (normalized.includes('deepseek')) return 128000; // Safe cap for cost-control for V4 models
  const baseModel = model.split(':')[0];
  if (MODEL_CONTEXT_WINDOWS[baseModel]) return MODEL_CONTEXT_WINDOWS[baseModel];
  return 32000; // Conservative default
}

export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimatePayloadTokens(messages: { content: string }[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokenCount(msg.content), 0);
}

