// Simple in-memory queue for MVP (fallback when Redis unavailable)
// Replaces BullMQ for local development

export interface Job {
  id: string;
  name: string;
  data: any;
  opts?: any;
}

export class JobQueue {
  private queue: Job[] = [];
  private processing: boolean = false;
  private processor?: (job: any) => Promise<any>;

  constructor(private queueName: string) {
    console.log(`[Queue] Initialized ${queueName} (in-memory mode)`);
  }

  async add(jobName: string, data: any, opts?: any): Promise<Job> {
    const job: Job = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: jobName,
      data,
      opts
    };

    this.queue.push(job);
    console.log(`[Queue] Added job ${job.id}: ${jobName}`);

    // Auto-start processing if processor is set
    if (this.processor && !this.processing) {
      this.processNext();
    }

    return job;
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    return this.queue.find(j => j.id === jobId);
  }

  async close(): Promise<void> {
    this.queue = [];
  }

  // For simple MVP: process immediately
  async process(processor: (job: any) => Promise<any>): Promise<void> {
    this.processor = processor;
    if (this.queue.length > 0 && !this.processing) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0 || !this.processor) {
      this.processing = false;
      return;
    }

    this.processing = true;
    const job = this.queue.shift();

    if (job) {
      try {
        console.log(`[Queue] Processing job ${job.id}: ${job.name}`);
        await this.processor(job);
        console.log(`[Queue] Completed job ${job.id}`);
      } catch (error) {
        console.error(`[Queue] Failed job ${job.id}:`, error);
      }
    }

    // Process next
    this.processNext();
  }
}

export function createWorker(
  queueName: string,
  processor: (job: any) => Promise<any>
) {
  const queue = new JobQueue(queueName);
  queue.process(processor);

  return {
    close: async () => await queue.close()
  };
}

export async function closeQueueConnections() {
  // No-op for in-memory queue
}
