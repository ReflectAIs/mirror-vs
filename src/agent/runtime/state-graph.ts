import { ExecutionState } from './types';

export type StateTransitionHandler = (from: ExecutionState, to: ExecutionState) => void | Promise<void>;

export class StateGraph {
  private _currentState: ExecutionState = ExecutionState.Planning;
  private _history: ExecutionState[] = [ExecutionState.Planning];
  private _listeners = new Set<StateTransitionHandler>();

  public get currentState(): ExecutionState {
    return this._currentState;
  }

  public get history(): ExecutionState[] {
    return [...this._history];
  }

  public onTransition(handler: StateTransitionHandler): { dispose: () => void } {
    this._listeners.add(handler);
    return {
      dispose: () => this._listeners.delete(handler),
    };
  }

  public async transitionTo(nextState: ExecutionState): Promise<void> {
    const previous = this._currentState;
    if (previous === nextState) return;

    this._currentState = nextState;
    this._history.push(nextState);

    for (const listener of this._listeners) {
      try {
        await listener(previous, nextState);
      } catch (err) {
        console.error(`Error in state transition listener from ${previous} to ${nextState}:`, err);
      }
    }
  }

  public reset(): void {
    this._currentState = ExecutionState.Planning;
    this._history = [ExecutionState.Planning];
  }
}
