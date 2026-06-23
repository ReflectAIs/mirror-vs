import * as vscode from 'vscode';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export class LoggerService {
  private static _instance: LoggerService;
  private _outputChannel: vscode.OutputChannel | undefined;
  private _logLevel: LogLevel = 'INFO';

  private constructor() {
    try {
      this._outputChannel = vscode.window.createOutputChannel('Mirror VS');
    } catch (e) {
      console.warn('VS Code output channel creation not supported in this environment.');
    }

    const config = vscode.workspace.getConfiguration('mirror-vs');
    const debugEnabled = config.get<boolean>('debugEnabled', false);
    if (debugEnabled) {
      this._logLevel = 'DEBUG';
    }
  }

  public static getInstance(): LoggerService {
    if (!this._instance) {
      this._instance = new LoggerService();
    }
    return this._instance;
  }

  public setLogLevel(level: LogLevel) {
    this._logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const priorities: Record<LogLevel, number> = {
      'DEBUG': 0,
      'INFO': 1,
      'WARN': 2,
      'ERROR': 3,
    };
    return priorities[level] >= priorities[this._logLevel];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    let formatted = `[${timestamp}] [${level}] ${message}`;
    if (args.length > 0) {
      formatted += ' ' + args.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))).join(' ');
    }
    return formatted;
  }

  public debug(message: string, ...args: any[]) {
    if (this.shouldLog('DEBUG')) {
      const msg = this.formatMessage('DEBUG', message, ...args);
      console.debug(msg);
      this._outputChannel?.appendLine(msg);
    }
  }

  public info(message: string, ...args: any[]) {
    if (this.shouldLog('INFO')) {
      const msg = this.formatMessage('INFO', message, ...args);
      console.info(msg);
      this._outputChannel?.appendLine(msg);
    }
  }

  public warn(message: string, ...args: any[]) {
    if (this.shouldLog('WARN')) {
      const msg = this.formatMessage('WARN', message, ...args);
      console.warn(msg);
      this._outputChannel?.appendLine(msg);
    }
  }

  public error(message: string, ...args: any[]) {
    if (this.shouldLog('ERROR')) {
      const msg = this.formatMessage('ERROR', message, ...args);
      console.error(msg);
      this._outputChannel?.appendLine(msg);
    }
  }

  public showOutput() {
    this._outputChannel?.show(true);
  }
}

export const logger = LoggerService.getInstance();
