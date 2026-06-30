import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateGraph } from '../state-graph';
import { ExecutionState } from '../types';
import { TaskQueue } from '../task-queue';
import { ContextStore } from '../context-store';
import { ActionRequestManager } from '../action-request';
import { LoopDetector } from '../loop-detector';
import { ExplorerModeManager } from '../explorer-mode';
import { ConfidenceEngine } from '../confidence-engine';
import { detectWorkspaceAdapter, NodeWorkspaceAdapter, GenericWorkspaceAdapter } from '../workspace-adapters';
import { JobManager } from '../job-manager';
import { EventBus } from '../../../services/event-bus';

describe('Mirror VS Runtime v1.0 Tests', () => {

  describe('StateGraph', () => {
    it('should transition forward and backward and fire listeners', async () => {
      const graph = new StateGraph();
      expect(graph.currentState).toBe(ExecutionState.Planning);

      const listener = vi.fn();
      graph.onTransition(listener);

      await graph.transitionTo(ExecutionState.Scheduling);
      expect(graph.currentState).toBe(ExecutionState.Scheduling);
      expect(listener).toHaveBeenCalledWith(ExecutionState.Planning, ExecutionState.Scheduling);

      // Transition backward
      await graph.transitionTo(ExecutionState.Planning);
      expect(graph.currentState).toBe(ExecutionState.Planning);
      expect(listener).toHaveBeenCalledWith(ExecutionState.Scheduling, ExecutionState.Planning);

      expect(graph.history).toEqual([
        ExecutionState.Planning,
        ExecutionState.Scheduling,
        ExecutionState.Planning,
      ]);
    });
  });

  describe('TaskQueue', () => {
    it('should decompose tasks and yield one active task at a time', () => {
      const queue = new TaskQueue();
      expect(queue.activeTask).toBeNull();

      const task1 = queue.addTask('Task 1');
      expect(queue.activeTaskId).toBe(task1.id);
      expect(task1.status).toBe('running');

      const task2 = queue.addTask('Task 2');
      expect(task2.status).toBe('queued');

      // Add subtask
      const subtask = queue.addTask('Subtask 1.1', task1.id);
      expect(task1.subtasks).toContain(subtask);
      expect(subtask.status).toBe('queued');

      // Complete active task
      queue.completeTask(task1.id, 'Output 1');
      expect(task1.status).toBe('completed');
      expect(task1.output).toBe('Output 1');

      // The next active task should be subtask (since it was queued first recursively)
      expect(queue.activeTaskId).toBe(subtask.id);
      expect(subtask.status).toBe('running');

      queue.completeTask(subtask.id);
      expect(queue.activeTaskId).toBe(task2.id);

      queue.failTask(task2.id, 'Failed output');
      expect(queue.activeTask).toBeNull();
    });
  });

  describe('ContextStore', () => {
    it('should calculate priority-scored eviction and evict lowest value items', () => {
      const store = new ContextStore();
      
      store.addItem('item1', 'content1', 'user', 10, 0, false); // priority 10
      store.addItem('item2', 'content2', 'assistant', 5, 2, false); // priority 5, deps 2
      store.addItem('item3', 'content3', 'tool', 1, 0, false); // priority 1
      store.addItem('pinned', 'content4', 'system', 99, 0, true); // pinned

      const score3 = store.calculateScore(store.getItem('item3')!);
      const score2 = store.calculateScore(store.getItem('item2')!);
      const score1 = store.calculateScore(store.getItem('item1')!);
      
      expect(score3).toBeLessThan(score2);
      expect(score2).toBeLessThan(score1);

      // Evict with budget
      // cost calculator simply returns 10 per item
      const evicted = store.evictToBudget(25, () => 10);
      expect(evicted).toContain('item3'); // lowest score
      expect(store.getItem('item3')).toBeUndefined();
      expect(store.getItem('pinned')).toBeDefined(); // should never be evicted
    });

    it('should calculate file-specific priority scores for page cache files', () => {
      const store = new ContextStore();
      
      // Target file (100 points)
      store.addItem('file:main.py', { content: 'import sys' }, 'tool', 100, 0, false, 1);
      // Types file (50 points)
      store.addItem('file:types.ts', { content: 'export interface User {}' }, 'tool', 50, 0, false, 1);
      // Config/Other file (10 points)
      store.addItem('file:config.json', { content: '{}' }, 'tool', 10, 0, false, 1);

      const targetScore = store.calculateScore(store.getItem('file:main.py')!);
      const typesScore = store.calculateScore(store.getItem('file:types.ts')!);
      const configScore = store.calculateScore(store.getItem('file:config.json')!);

      expect(configScore).toBeLessThan(typesScore);
      expect(typesScore).toBeLessThan(targetScore);

      // Verify exact scores (priority + recency * 0.1)
      expect(configScore).toBeCloseTo(10 + 6 * 0.1);
      expect(typesScore).toBeCloseTo(50 + 5 * 0.1);
      expect(targetScore).toBeCloseTo(100 + 4 * 0.1);
    });
  });

  describe('ActionRequestManager', () => {
    it('should normalize tool calls and choose edit strategy', () => {
      const manager = new ActionRequestManager();

      const patchCall = { name: 'patch_file', path: 'src/file.ts', TargetContent: 'abc', ReplacementContent: 'def' };
      const request = manager.parseActionRequest(patchCall);

      expect(request.type).toBe('MODIFY_CODE');
      expect(request.targetPath).toBe('src/file.ts');
      expect(request.patchStrategy).toBe('rewrite'); // File does not exist, defaults to rewrite
    });
  });

  describe('LoopDetector', () => {
    it('should detect loops based on lack of progress', () => {
      const detector = new LoopDetector();
      expect(detector.detectLoop().isLoop).toBe(false);

      for (let i = 0; i < 14; i++) {
        detector.registerTurn();
      }
      expect(detector.detectLoop().isLoop).toBe(false);

      detector.registerTurn();
      expect(detector.detectLoop().isLoop).toBe(true);

      // register progress resets loop detection
      detector.registerProgress('patch_applied', 'Patched index.ts');
      expect(detector.detectLoop().isLoop).toBe(false);
    });

    it('should detect exact repetitive action loops immediately', () => {
      const detector = new LoopDetector();
      expect(detector.detectLoop().isLoop).toBe(false);

      detector.registerAction('read_file:src/screens/buyers/tpm/plans/Monthly.jsx');
      detector.registerAction('read_file:src/screens/buyers/tpm/plans/Monthly.jsx');
      expect(detector.detectLoop().isLoop).toBe(false);

      detector.registerAction('read_file:src/screens/buyers/tpm/plans/Monthly.jsx');
      const check = detector.detectLoop();
      expect(check.isLoop).toBe(true);
      expect(check.reason).toContain('has been repeated 3 times');
    });
  });

  describe('ExplorerModeManager', () => {
    it('should manage success criteria transitions', () => {
      const manager = new ExplorerModeManager();
      expect(manager.shouldExitExplorer()).toBe(false);

      manager.setCriteria({ targetLocated: true });
      expect(manager.shouldExitExplorer()).toBe(true);
    });
  });

  describe('ConfidenceEngine', () => {
    it('should calculate deterministic confidence level', () => {
      const engine = new ConfidenceEngine();
      
      const highConf = engine.calculateConfidence({
        hasPatchedSuccessfully: true,
        buildSuccessful: true,
        testsPassed: true,
        diagnosticsCount: 0,
      });
      expect(highConf.score).toBe(100);
      expect(highConf.level).toBe('HIGH');

      const lowConf = engine.calculateConfidence({
        hasPatchedSuccessfully: false,
        buildSuccessful: false,
        testsPassed: false,
        diagnosticsCount: 5,
      });
      expect(lowConf.score).toBe(0);
      expect(lowConf.level).toBe('LOW');
    });
  });

  describe('WorkspaceAdapters', () => {
    it('should detect adapters based on workspace files', () => {
      const nodeAdapter = detectWorkspaceAdapter(__dirname + '/../../../../'); // root of repo
      expect(nodeAdapter.name).toBe('Node');

      const genericAdapter = detectWorkspaceAdapter('/tmp/some-non-existent-dir-123');
      expect(genericAdapter.name).toBe('Generic');
    });
  });

  describe('JobManager', () => {
    it('should manage and lifecycle jobs, firing event bus triggers', () => {
      const bus = EventBus.getInstance();
      const listener = vi.fn();
      bus.on('JobCompleted', listener);

      const manager = new JobManager();
      const job = manager.createJob('Run tests', 'test');
      expect(job.status).toBe('queued');

      manager.startJob(job.id);
      expect(job.status).toBe('running');

      manager.completeJob(job.id, 'Tests passed stdout', 0);
      expect(job.status).toBe('completed');
      expect(job.exitCode).toBe(0);
      expect(job.output).toBe('Tests passed stdout');

      expect(listener).toHaveBeenCalled();
    });
  });

});
