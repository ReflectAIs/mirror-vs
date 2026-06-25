import { describe, it, expect, vi } from 'vitest';
import { ASTParser } from '../ast-parser';
import { KnowledgeGraph } from '../knowledge-graph';
import { MultiAgentCoordinator } from '../multi-agent';
import { LearningEngine } from '../learning-engine';

describe('Mirror VS Runtime Phase 3 & 4 Tests', () => {

  describe('ASTParser', () => {
    it('should parse TS/JS functions and classes and perform symbol replacement', () => {
      const code = `
export class App {
  start() {
    console.log("running");
  }
}

export function helper() {
  return "hello";
}
`;
      const parser = new ASTParser();
      const symbols = parser.parseSymbols(code, 'typescript');

      expect(symbols.length).toBe(3);
      expect(symbols.find(s => s.name === 'App')?.type).toBe('class');
      expect(symbols.find(s => s.name === 'helper')?.type).toBe('function');
      expect(symbols.find(s => s.name === 'start')?.type).toBe('method');

      // Replace helper function symbol
      const updatedCode = parser.replaceSymbol(
        code,
        'helper',
        `export function helper() {\n  return "world";\n}`,
        'typescript'
      );
      expect(updatedCode).toContain('world');
      expect(updatedCode).not.toContain('hello');
    });

    it('should parse Python classes and defs', () => {
      const code = `
class Calculator:
    def add(self, a, b):
        return a + b

def global_helper():
    print("helper")
`;
      const parser = new ASTParser();
      const symbols = parser.parseSymbols(code, 'python');

      expect(symbols.length).toBe(3);
      expect(symbols.find(s => s.name === 'Calculator')?.type).toBe('class');
      expect(symbols.find(s => s.name === 'global_helper')?.type).toBe('function');
    });
  });

  describe('KnowledgeGraph', () => {
    it('should track imports and transitive dependencies to find affected files and tests', () => {
      const graph = new KnowledgeGraph();
      graph.addNode('src/utils.ts', 'file');
      graph.addNode('src/app.ts', 'file');
      graph.addNode('src/app.test.ts', 'file');

      // src/app.ts imports src/utils.ts
      graph.addEdge('src/app.ts', 'src/utils.ts', 'imports');
      // src/app.test.ts is tests for src/app.ts
      graph.addEdge('src/app.ts', 'src/app.test.ts', 'tests');

      const affected = graph.getAffectedFiles('src/utils.ts');
      expect(affected).toContain('src/app.ts');

      const relatedTests = graph.findRelatedTests('src/utils.ts');
      expect(relatedTests).toContain('src/app.test.ts');
    });
  });

  describe('MultiAgentCoordinator', () => {
    it('should delegate goals and exchange messages between roles', () => {
      const coordinator = new MultiAgentCoordinator();
      const plan = coordinator.planner.plan('Fix user auth');
      expect(plan.length).toBeGreaterThan(0);

      coordinator.sendMessage({
        from: 'Planner',
        to: 'Executor',
        content: `Decomposed steps: ${plan.join(', ')}`
      });

      expect(coordinator.messages.length).toBe(1);
      expect(coordinator.messages[0].from).toBe('Planner');
    });
  });

  describe('LearningEngine', () => {
    it('should calculate cost multipliers based on strategy success history', () => {
      const engine = new LearningEngine();
      expect(engine.getCostMultiplier('line')).toBe(1.0);

      engine.registerOutcome('task-1', 'line', false);
      engine.registerOutcome('task-2', 'line', false);
      expect(engine.getCostMultiplier('line')).toBe(2.0); // 1.0 + 2 * 0.5

      engine.registerOutcome('task-3', 'line', true);
      // Only last 3 are checked, so it checks: false, false, true -> 2 failures -> 2.0
      expect(engine.getCostMultiplier('line')).toBe(2.0);
    });
  });

});
