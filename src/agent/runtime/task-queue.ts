import { Task } from './types';

export class TaskQueue {
  private _tasks: Task[] = [];
  private _activeTaskId: string | null = null;
  private _taskCounter = 0;

  public get tasks(): Task[] {
    return this._tasks;
  }

  public get activeTaskId(): string | null {
    return this._activeTaskId;
  }

  public get activeTask(): Task | null {
    if (!this._activeTaskId) return null;
    return this.findTaskById(this._activeTaskId) || null;
  }

  public addTask(description: string, parentId?: string): Task {
    this._taskCounter++;
    const task: Task = {
      id: `task-${this._taskCounter}`,
      description,
      parentId,
      status: 'queued',
      subtasks: [],
    };

    if (parentId) {
      const parent = this.findTaskById(parentId);
      if (parent) {
        task.parentId = parentId;
        parent.subtasks.push(task);
        return task;
      }
    }

    this._tasks.push(task);
    
    // Automatically set as active if no active task
    if (!this._activeTaskId) {
      this._activeTaskId = task.id;
      task.status = 'running';
    }

    return task;
  }

  public completeTask(taskId: string, output?: string): void {
    const task = this.findTaskById(taskId);
    if (task) {
      task.status = 'completed';
      task.output = output;
      if (this._activeTaskId === taskId) {
        this.selectNextActiveTask();
      }
    }
  }

  public failTask(taskId: string, output?: string): void {
    const task = this.findTaskById(taskId);
    if (task) {
      task.status = 'failed';
      task.output = output;
      if (this._activeTaskId === taskId) {
        this.selectNextActiveTask();
      }
    }
  }

  public findTaskById(id: string): Task | null {
    const search = (list: Task[]): Task | null => {
      for (const t of list) {
        if (t.id === id) return t;
        const sub = search(t.subtasks);
        if (sub) return sub;
      }
      return null;
    };
    return search(this._tasks);
  }

  private selectNextActiveTask(): void {
    // Find first queued task recursively
    const findFirstQueued = (list: Task[]): Task | null => {
      for (const t of list) {
        if (t.status === 'queued') return t;
        const sub = findFirstQueued(t.subtasks);
        if (sub) return sub;
      }
      return null;
    };

    const next = findFirstQueued(this._tasks);
    if (next) {
      this._activeTaskId = next.id;
      next.status = 'running';
    } else {
      this._activeTaskId = null;
    }
  }

  public getActiveTaskPromptContext(): string {
    const active = this.activeTask;
    if (!active) {
      return 'No active task currently queued. Please ask the user for a task or declare planning complete.';
    }
    return `[Active Task]: ${active.description} (${active.id})`;
  }

  public decomposeTask(taskId: string, subtasks: string[]): void {
    const parent = this.findTaskById(taskId);
    if (parent) {
      if (parent.status === 'queued') {
        parent.status = 'running';
      }
      for (const desc of subtasks) {
        this.addTask(desc, taskId);
      }
    }
  }

  public clear(): void {
    this._tasks = [];
    this._activeTaskId = null;
    this._taskCounter = 0;
  }
}
