export enum ExecutionState {
  Planning = 'Planning',
  Scheduling = 'Scheduling',
  Reasoning = 'Reasoning',
  Executing = 'Executing',
  Verifying = 'Verifying',
  Interrupted = 'Interrupted',
  Recovery = 'Recovery',
}

export interface Task {
  id: string;
  description: string;
  parentId?: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  subtasks: Task[];
  output?: string;
}

export interface ContextItem {
  key: string;
  value: any;
  priority: number; // e.g. user messages high priority, temp outputs lower priority
  role: 'system' | 'user' | 'assistant' | 'tool';
  recency: number; // counter or timestamp
  dependencyCount: number; // number of references or related nodes
  pinStatus: boolean;
}

export type ActionRequestType = 'MODIFY_CODE' | 'EXPLORE' | 'VERIFY' | 'GENERIC';

export interface ActionRequest {
  type: ActionRequestType;
  targetPath?: string;
  patchStrategy?: 'line' | 'symbol' | 'AST' | 'rewrite';
  details?: any;
}

export interface Job {
  id: string;
  name: string;
  type: 'build' | 'test' | 'npm' | 'docker' | 'git' | 'indexing' | 'browser' | 'generic';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  exitCode?: number;
  output: string;
}
