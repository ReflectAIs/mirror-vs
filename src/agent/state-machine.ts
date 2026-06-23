import * as path from 'path';
import { ChatMessage } from '../types';

export enum AgentState {
  DISCOVERY = 'DISCOVERY',
  IMPLEMENTATION = 'IMPLEMENTATION',
  VERIFICATION = 'VERIFICATION',
  BLOCKED = 'BLOCKED',
  NEEDS_EVIDENCE = 'NEEDS_EVIDENCE',
}

export enum TaskMode {
  REVIEW = 'REVIEW',
  DEBUG = 'DEBUG',
  IMPLEMENT = 'IMPLEMENT',
  VERIFY = 'VERIFY',
}

export function determineTaskMode(userMessage: string, configMode: string): TaskMode {
  const lower = userMessage.toLowerCase();
  
  const isWriteOrSetupAction = [
    'create', 'build', 'write', 'generate', 'setup', 'init', 'install', 'add', 'make',
    'implement', 'change', 'modify', 'update', 'patch', 'delete', 'remove', 'run', 'start', 'dev'
  ].some((verb) => new RegExp(`\\b${verb}\\b`, 'i').test(lower));

  if (
    lower.includes('run test') ||
    lower.includes('run lint') ||
    lower.includes('run build') ||
    lower.includes('npm test') ||
    lower.includes('npm run test') ||
    lower.includes('vitest') ||
    lower.includes('eslint') ||
    lower.includes('typecheck') ||
    /^(run|execute|perform|verify) (the )?(tests?|build|lint|typecheck)/i.test(lower)
  ) {
    return TaskMode.VERIFY;
  }

  if (isWriteOrSetupAction) {
    return TaskMode.IMPLEMENT;
  }

  if (
    ['review', 'audit', 'analyze', 'improvements', 'feedback', 'architecture review', 'frontend review'].some(
      (keyword) => lower.includes(keyword),
    )
  ) {
    return TaskMode.REVIEW;
  }
  if (
    configMode === 'debug' ||
    lower.includes('bug') ||
    lower.includes('fix') ||
    lower.includes('error') ||
    lower.includes('crash') ||
    lower.includes('fail')
  ) {
    return TaskMode.DEBUG;
  }
  return TaskMode.IMPLEMENT;
}

export function canDescribePatch(text: string, verifiedFiles: Set<string>): boolean {
  const lower = text.toLowerCase();

  const hasPlanOrCode = /<implementation_plan>|<patch_file>|```diff/i.test(text);
  const declaresCommitment = [
    'apply the patch',
    'i will now modify',
    'write the patch',
    'applying the patch',
    'applying patch',
    'ready to patch',
    'here is the code change',
    'here is the fix',
    'we need to change',
    'the fix is to',
    'should be changed to',
    'propose the following patch',
    'modified code',
  ].some((p) => lower.includes(p));

  if (!hasPlanOrCode && !declaresCommitment) {
    return false;
  }

  let mentionsVerifiedFile = false;
  for (const file of verifiedFiles) {
    const baseName = path.basename(file).toLowerCase();
    if (baseName && lower.includes(baseName)) {
      mentionsVerifiedFile = true;
      break;
    }
  }

  return mentionsVerifiedFile;
}

export function hasSufficientJSEvidence(messages: ChatMessage[]): boolean {
  let hasGenericCrash = false;
  let hasStackTrace = false;
  for (const msg of messages) {
    const content = msg.content.toLowerCase();
    if (content.includes('javascriptexception') || content.includes('js exception') || content.includes('crash')) {
      hasGenericCrash = true;
    }
    if (
      content.includes('stack trace') ||
      content.includes('at ') ||
      content.includes('.js:') ||
      content.includes('.ts:') ||
      content.includes('error:') ||
      content.includes('exception:')
    ) {
      hasStackTrace = true;
    }
  }
  if (hasGenericCrash && !hasStackTrace) {
    return false;
  }
  return true;
}

export function isErrorDirectlyLocalized(messages: ChatMessage[], verifiedFiles: Set<string>): boolean {
  if (verifiedFiles.size === 0) return false;
  let hasErrorText = false;
  let errorFileFound = false;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const content = msg.content;
    const lowerContent = content.toLowerCase();

    const isError =
      lowerContent.includes('[build status]: failed') ||
      lowerContent.includes('compilation error') ||
      lowerContent.includes('unresolved reference') ||
      lowerContent.includes('error:') ||
      lowerContent.includes('failed:') ||
      lowerContent.includes('javascriptexception') ||
      lowerContent.includes('exception in thread') ||
      lowerContent.includes('crash');

    if (isError) {
      hasErrorText = true;
      for (const filePath of verifiedFiles) {
        const baseName = path.basename(filePath).toLowerCase();
        if (baseName && lowerContent.includes(baseName)) {
          errorFileFound = true;
          break;
        }
      }
    }
    if (hasErrorText && errorFileFound) {
      return true;
    }
  }
  return false;
}

export function hasEnoughInformationForReview(
  taskMode: TaskMode,
  verifiedFiles: Set<string>,
  messages: ChatMessage[],
): boolean {
  if (taskMode !== TaskMode.REVIEW) return false;
  if (verifiedFiles.size === 0) return false;

  let hasReadResult = false;
  for (const msg of messages) {
    if (
      msg.role === 'system' &&
      msg.content.includes('[Tool Result for read_file on "') &&
      msg.content.includes('Success -')
    ) {
      hasReadResult = true;
      break;
    }
  }

  return hasReadResult;
}

export function detectActiveSymptom(messages: ChatMessage[]): 'BUILD_FAILURE' | 'NETWORK_ERROR' | 'AUTH_FAILURE' | 'NONE' {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i].content.toLowerCase();
    if (
      content.includes('[build status]: failed') ||
      content.includes('compilation error') ||
      content.includes('unresolved reference')
    ) {
      return 'BUILD_FAILURE';
    }
    if (
      content.includes('network') ||
      content.includes('axios') ||
      content.includes('http') ||
      content.includes('internet') ||
      content.includes('timeout') ||
      content.includes('fetch')
    ) {
      return 'NETWORK_ERROR';
    }
    if (
      content.includes('auth') ||
      content.includes('login') ||
      content.includes('token') ||
      content.includes('session') ||
      content.includes('credentials')
    ) {
      return 'AUTH_FAILURE';
    }
  }
  return 'NONE';
}
