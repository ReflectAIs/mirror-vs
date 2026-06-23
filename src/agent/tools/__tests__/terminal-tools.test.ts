import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';
import { executeTerminalTool } from '../terminal-tools';
import { CommandService } from '../../../services/command-service';

// Mock CommandService
vi.mock('../../../services/command-service', () => {
  const mockInstance = {
    executeCommand: vi.fn(),
    sendInputToTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    readTerminalOutput: vi.fn(),
    getActiveTerminals: vi.fn(),
  };
  return {
    CommandService: {
      getInstance: () => mockInstance,
    },
  };
});

describe('executeTerminalTool', () => {
  const serviceMock = CommandService.getInstance() as any;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('run_command', () => {
    it('should throw if command is missing', async () => {
      const tool = { name: 'run_command' as const };
      await expect(executeTerminalTool(tool)).rejects.toThrow('Missing "command" attribute for run_command.');
    });

    it('should throw for forbidden git commands', async () => {
      const tool = { name: 'run_command' as const, command: 'git push origin main' };
      await expect(executeTerminalTool(tool)).rejects.toThrow('Git push or remote modifications are forbidden');
    });

    it('should execute command successfully', async () => {
      serviceMock.executeCommand.mockResolvedValue('Command output');
      const tool = { name: 'run_command' as const, command: 'echo hello' };
      const result = await executeTerminalTool(tool);

      expect(result).toBe('Command output');
      expect(serviceMock.executeCommand).toHaveBeenCalledWith('echo hello');
    });
  });

  describe('send_terminal_input', () => {
    it('should throw if terminal name or input is missing', async () => {
      const tool1 = { name: 'send_terminal_input' as const, content: 'input' };
      await expect(executeTerminalTool(tool1)).rejects.toThrow('Missing "terminal_name" attribute');

      const tool2 = { name: 'send_terminal_input' as const, terminal_name: 'test' };
      await expect(executeTerminalTool(tool2)).rejects.toThrow('Missing terminal input content.');
    });

    it('should send input to terminal', async () => {
      serviceMock.sendInputToTerminal.mockReturnValue(true);
      const tool = { name: 'send_terminal_input' as const, terminal_name: 'test-term', content: 'ls' };
      const result = await executeTerminalTool(tool);

      expect(result).toContain('Successfully sent input to terminal "test-term"');
      expect(serviceMock.sendInputToTerminal).toHaveBeenCalledWith('test-term', 'ls');
    });
  });

  describe('close_terminal', () => {
    it('should close terminal successfully', async () => {
      serviceMock.closeTerminal.mockReturnValue(true);
      const tool = { name: 'close_terminal' as const, terminal_name: 'test-term' };
      const result = await executeTerminalTool(tool);

      expect(result).toContain('Successfully closed and terminated terminal "test-term"');
      expect(serviceMock.closeTerminal).toHaveBeenCalledWith('test-term');
    });
  });

  describe('read_terminal', () => {
    it('should read terminal output', async () => {
      serviceMock.readTerminalOutput.mockReturnValue({
        output: 'Terminal contents',
        running: true,
        exitCode: null,
      });

      const tool = { name: 'read_terminal' as const, terminal_name: 'test-term', chars: '1000' };
      const result = await executeTerminalTool(tool);

      expect(result).toContain('Process is still RUNNING');
      expect(result).toContain('Terminal contents');
      expect(serviceMock.readTerminalOutput).toHaveBeenCalledWith('test-term', 1000);
    });
  });

  describe('list_terminals', () => {
    it('should return empty message when no active terminals', async () => {
      serviceMock.getActiveTerminals.mockReturnValue([]);
      const tool = { name: 'list_terminals' as const };
      const result = await executeTerminalTool(tool);

      expect(result).toContain('No active agent-managed terminals.');
    });

    it('should list active terminals', async () => {
      serviceMock.getActiveTerminals.mockReturnValue([
        { name: 'term1', command: 'node server.js', isServer: true, running: true, exitCode: null },
      ]);
      const tool = { name: 'list_terminals' as const };
      const result = await executeTerminalTool(tool);

      expect(result).toContain('Active terminals (1):');
      expect(result).toContain('"term1" [SERVER] 🟢 RUNNING');
    });
  });
});
