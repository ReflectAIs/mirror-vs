export type EventName = 'file_saved' | 'file_modified' | 'task_completed' | 'session_started' | 'error_detected' | 'FilePatched' | 'DiagnosticsUpdated' | 'JobCompleted' | 'WorkspaceChanged' | 'UserInterrupted' | 'VerificationPassed';

export type EventHandler = (data?: any) => void | Promise<void>;

export interface Disposable {
  dispose(): void;
}

export class EventBus {
  private static _instance: EventBus;
  private _handlers = new Map<EventName, Set<EventHandler>>();

  private constructor() {}

  public static getInstance(): EventBus {
    if (!EventBus._instance) {
      EventBus._instance = new EventBus();
    }
    return EventBus._instance;
  }

  public on(event: EventName, handler: EventHandler): Disposable {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event)!.add(handler);

    return {
      dispose: () => {
        const handlers = this._handlers.get(event);
        if (handlers) {
          handlers.delete(handler);
          if (handlers.size === 0) {
            this._handlers.delete(event);
          }
        }
      },
    };
  }

  public fire(event: EventName, data?: any): void {
    const handlers = this._handlers.get(event);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      try {
        const result = handler(data);
        if (result instanceof Promise) {
          result.catch((err) => {
            console.error(`Error executing async event handler for event '${event}':`, err);
          });
        }
      } catch (err) {
        console.error(`Error executing event handler for event '${event}':`, err);
      }
    }
  }

  public clear(): void {
    this._handlers.clear();
  }
}
