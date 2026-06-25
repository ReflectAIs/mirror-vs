import { Task, ActionRequest } from './types';

export interface AgentMessage {
  from: 'Planner' | 'Executor' | 'Verifier';
  to: 'Planner' | 'Executor' | 'Verifier';
  content: string;
}

export class PlannerAgent {
  public plan(goal: string): string[] {
    return [
      `Analyze codebase and dependencies related to: ${goal}`,
      `Implement necessary changes for: ${goal}`,
      `Run builds and tests to verify: ${goal}`,
    ];
  }
}

export class ExecutorAgent {
  public execute(task: Task): ActionRequest {
    return {
      type: 'MODIFY_CODE',
      targetPath: undefined,
      details: { taskDescription: task.description },
    };
  }
}

export class VerifierAgent {
  public verify(task: Task, buildSuccessful: boolean, testsPassed: boolean): boolean {
    return buildSuccessful && testsPassed;
  }
}

export class MultiAgentCoordinator {
  private _planner = new PlannerAgent();
  private _executor = new ExecutorAgent();
  private _verifier = new VerifierAgent();
  private _messages: AgentMessage[] = [];

  public get planner(): PlannerAgent {
    return this._planner;
  }
  public get executor(): ExecutorAgent {
    return this._executor;
  }
  public get verifier(): VerifierAgent {
    return this._verifier;
  }
  public get messages(): AgentMessage[] {
    return this._messages;
  }

  public sendMessage(msg: AgentMessage): void {
    this._messages.push(msg);
    console.log(`[Multi-Agent Message] [${msg.from} -> ${msg.to}]: ${msg.content}`);
  }

  public clear(): void {
    this._messages = [];
  }
}
