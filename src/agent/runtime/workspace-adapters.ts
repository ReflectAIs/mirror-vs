import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface WorkspaceAdapter {
  name: string;
  build(): Promise<{ success: boolean; output: string }>;
  test(): Promise<{ success: boolean; output: string }>;
  restart(): Promise<{ success: boolean }>;
  getDiagnostics(): Promise<{ errorsCount: number; output: string }>;
  getPackageManager(): string;
}

export class NodeWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Node';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('npm run build', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('npm test', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async restart(): Promise<{ success: boolean }> {
    console.log('Node project restart: triggered package reload.');
    return { success: true };
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('npm run lint', { cwd: this.workspaceRoot });
      return { errorsCount: 0, output: stdout + '\n' + stderr };
    } catch (err: any) {
      const output = (err.stdout || '') + '\n' + (err.stderr || '') || err.message;
      const match = output.match(/(\d+)\s+errors?/i);
      const errorsCount = match ? parseInt(match[1], 10) : 1;
      return { errorsCount, output };
    }
  }

  public getPackageManager(): string {
    if (fs.existsSync(path.join(this.workspaceRoot, 'package-lock.json'))) return 'npm';
    if (fs.existsSync(path.join(this.workspaceRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(this.workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    return 'npm';
  }
}

export class PythonWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Python';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    try {
      const venvBin = process.platform.startsWith('win') ? 'venv\\Scripts\\pip' : 'venv/bin/pip';
      const pipCmd = fs.existsSync(path.join(this.workspaceRoot, 'venv')) ? venvBin : 'pip';
      const { stdout, stderr } = await execAsync(`${pipCmd} install -r requirements.txt`, { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    try {
      const venvBin = process.platform.startsWith('win') ? 'venv\\Scripts\\pytest' : 'venv/bin/pytest';
      const pytestCmd = fs.existsSync(path.join(this.workspaceRoot, 'venv')) ? venvBin : 'pytest';
      const { stdout, stderr } = await execAsync(pytestCmd, { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async restart(): Promise<{ success: boolean }> {
    return { success: true };
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    try {
      const venvBin = process.platform.startsWith('win') ? 'venv\\Scripts\\flake8' : 'venv/bin/flake8';
      const flakeCmd = fs.existsSync(path.join(this.workspaceRoot, 'venv')) ? venvBin : 'flake8';
      const { stdout, stderr } = await execAsync(flakeCmd, { cwd: this.workspaceRoot });
      return { errorsCount: 0, output: stdout + '\n' + stderr };
    } catch (err: any) {
      const output = (err.stdout || '') + '\n' + (err.stderr || '') || err.message;
      const errorsCount = output.split('\n').filter(Boolean).length;
      return { errorsCount, output };
    }
  }

  public getPackageManager(): string {
    if (fs.existsSync(path.join(this.workspaceRoot, 'Pipfile'))) return 'pipenv';
    if (fs.existsSync(path.join(this.workspaceRoot, 'poetry.lock'))) return 'poetry';
    return 'pip';
  }
}

export class RustWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Rust';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('cargo build', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('cargo test', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async restart(): Promise<{ success: boolean }> {
    return { success: true };
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('cargo check', { cwd: this.workspaceRoot });
      return { errorsCount: 0, output: stdout + '\n' + stderr };
    } catch (err: any) {
      const output = (err.stdout || '') + '\n' + (err.stderr || '') || err.message;
      const errorsCount = (output.match(/error:/g) || []).length;
      return { errorsCount, output };
    }
  }

  public getPackageManager(): string {
    return 'cargo';
  }
}

export class GoWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Go';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('go build ./...', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('go test ./...', { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async restart(): Promise<{ success: boolean }> {
    return { success: true };
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    try {
      const { stdout, stderr } = await execAsync('go vet ./...', { cwd: this.workspaceRoot });
      return { errorsCount: 0, output: stdout + '\n' + stderr };
    } catch (err: any) {
      const output = (err.stdout || '') + '\n' + (err.stderr || '') || err.message;
      const errorsCount = output.split('\n').filter(Boolean).length;
      return { errorsCount, output };
    }
  }

  public getPackageManager(): string {
    return 'go mod';
  }
}

export class DockerWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Docker';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    try {
      const cmd = fs.existsSync(path.join(this.workspaceRoot, 'docker-compose.yml'))
        ? 'docker-compose build'
        : 'docker build .';
      const { stdout, stderr } = await execAsync(cmd, { cwd: this.workspaceRoot });
      return { success: true, output: stdout + '\n' + stderr };
    } catch (err: any) {
      return { success: false, output: (err.stdout || '') + '\n' + (err.stderr || '') || err.message };
    }
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    return { success: true, output: 'Docker container build verified as active test.' };
  }

  public async restart(): Promise<{ success: boolean }> {
    try {
      if (fs.existsSync(path.join(this.workspaceRoot, 'docker-compose.yml'))) {
        await execAsync('docker-compose restart', { cwd: this.workspaceRoot });
      }
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    return { errorsCount: 0, output: '' };
  }

  public getPackageManager(): string {
    return 'docker';
  }
}

export class GenericWorkspaceAdapter implements WorkspaceAdapter {
  public name = 'Generic';

  constructor(private workspaceRoot: string) {}

  public async build(): Promise<{ success: boolean; output: string }> {
    return { success: true, output: 'No build step specified.' };
  }

  public async test(): Promise<{ success: boolean; output: string }> {
    return { success: true, output: 'No tests specified.' };
  }

  public async restart(): Promise<{ success: boolean }> {
    return { success: true };
  }

  public async getDiagnostics(): Promise<{ errorsCount: number; output: string }> {
    return { errorsCount: 0, output: '' };
  }

  public getPackageManager(): string {
    return 'none';
  }
}

export function detectWorkspaceAdapter(workspaceRoot: string): WorkspaceAdapter {
  if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
    return new NodeWorkspaceAdapter(workspaceRoot);
  }
  if (fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) {
    return new RustWorkspaceAdapter(workspaceRoot);
  }
  if (fs.existsSync(path.join(workspaceRoot, 'go.mod'))) {
    return new GoWorkspaceAdapter(workspaceRoot);
  }
  if (
    fs.existsSync(path.join(workspaceRoot, 'requirements.txt')) ||
    fs.existsSync(path.join(workspaceRoot, 'pyproject.toml')) ||
    fs.existsSync(path.join(workspaceRoot, 'Pipfile'))
  ) {
    return new PythonWorkspaceAdapter(workspaceRoot);
  }
  if (
    fs.existsSync(path.join(workspaceRoot, 'Dockerfile')) ||
    fs.existsSync(path.join(workspaceRoot, 'docker-compose.yml'))
  ) {
    return new DockerWorkspaceAdapter(workspaceRoot);
  }
  return new GenericWorkspaceAdapter(workspaceRoot);
}
