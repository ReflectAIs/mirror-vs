import { Job } from './types';
import { EventBus } from '../../services/event-bus';

export class JobManager {
  private _jobs = new Map<string, Job>();
  private _jobCounter = 0;

  public get jobs(): Job[] {
    return Array.from(this._jobs.values());
  }

  public createJob(
    name: string,
    type: 'build' | 'test' | 'npm' | 'docker' | 'git' | 'indexing' | 'browser' | 'generic',
  ): Job {
    this._jobCounter++;
    const job: Job = {
      id: `job-${this._jobCounter}`,
      name,
      type,
      status: 'queued',
      startTime: Date.now(),
      output: '',
    };
    this._jobs.set(job.id, job);
    return job;
  }

  public startJob(id: string): void {
    const job = this._jobs.get(id);
    if (job) {
      job.status = 'running';
      job.startTime = Date.now();
    }
  }

  public completeJob(id: string, output: string, exitCode: number = 0): void {
    const job = this._jobs.get(id);
    if (job) {
      job.status = 'completed';
      job.endTime = Date.now();
      job.output = output;
      job.exitCode = exitCode;
      
      try {
        EventBus.getInstance().fire('JobCompleted', { jobId: id, job });
      } catch (err) {
        console.error('Error firing JobCompleted event:', err);
      }
    }
  }

  public failJob(id: string, output: string, exitCode: number = 1): void {
    const job = this._jobs.get(id);
    if (job) {
      job.status = 'failed';
      job.endTime = Date.now();
      job.output = output;
      job.exitCode = exitCode;

      try {
        EventBus.getInstance().fire('JobCompleted', { jobId: id, job });
      } catch (err) {
        console.error('Error firing JobCompleted event:', err);
      }
    }
  }

  public cancelJob(id: string): void {
    const job = this._jobs.get(id);
    if (job) {
      job.status = 'cancelled';
      job.endTime = Date.now();

      try {
        EventBus.getInstance().fire('JobCompleted', { jobId: id, job });
      } catch (err) {
        console.error('Error firing JobCompleted event:', err);
      }
    }
  }

  public clear(): void {
    this._jobs.clear();
    this._jobCounter = 0;
  }
}
