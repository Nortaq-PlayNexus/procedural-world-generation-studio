import InlineGeneratorWorker from "../workers/generator.worker?worker&inline";
import type { GenerationProgress, WorldConfig, WorldData } from "./types";
import { generateWorldAsync } from "./worldgen";

type WorkerResponse =
  | { type: "progress"; id: number; progress: GenerationProgress }
  | { type: "complete"; id: number; world: WorldData }
  | { type: "cancelled"; id: number }
  | { type: "error"; id: number; message: string };

interface PendingJob {
  id: number;
  resolve: (world: WorldData) => void;
  reject: (error: unknown) => void;
  onProgress: (progress: GenerationProgress) => void;
}

/**
 * Worker orchestration with a transparent main-thread fallback.
 * The worker is created lazily, reused between jobs and never shared across
 * simultaneous generations; cancellation is targeted by job id.
 */
class GenerationClient {
  private worker: Worker | null = null;
  private workerUnavailable = false;
  private nextId = 1;
  private pending: PendingJob | null = null;
  private fallbackController: AbortController | null = null;

  private ensureWorker(): Worker | null {
    if (this.workerUnavailable) return null;
    if (this.worker) return this.worker;
    try {
      const worker = new InlineGeneratorWorker({ name: "ark-worldgen" });
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => this.handleMessage(event.data);
      worker.onerror = () => {
        // A fatal worker error must not strand the UI. Reject the active job;
        // the caller falls back to main-thread generation on the next request.
        this.workerUnavailable = true;
        this.failPending(new Error("Generation worker crashed"));
        this.worker?.terminate();
        this.worker = null;
      };
      this.worker = worker;
      return worker;
    } catch {
      this.workerUnavailable = true;
      return null;
    }
  }

  private handleMessage(message: WorkerResponse) {
    const job = this.pending;
    if (!job || message.id !== job.id) return;
    if (message.type === "progress") {
      job.onProgress(message.progress);
      return;
    }
    this.pending = null;
    if (message.type === "complete") job.resolve(message.world);
    else if (message.type === "cancelled") job.reject(new DOMException("Generation cancelled", "AbortError"));
    else job.reject(new Error(message.message));
  }

  private failPending(error: unknown) {
    if (!this.pending) return;
    const job = this.pending;
    this.pending = null;
    job.reject(error);
  }

  cancel() {
    if (this.pending && this.worker) {
      this.worker.postMessage({ type: "cancel", id: this.pending.id });
      const job = this.pending;
      this.pending = null;
      job.reject(new DOMException("Generation cancelled", "AbortError"));
    }
    this.fallbackController?.abort();
    this.fallbackController = null;
  }

  async generate(config: WorldConfig, onProgress: (progress: GenerationProgress) => void): Promise<WorldData> {
    this.cancel();
    const worker = this.ensureWorker();
    if (worker) {
      const id = this.nextId++;
      return new Promise<WorldData>((resolve, reject) => {
        this.pending = { id, resolve, reject, onProgress };
        worker.postMessage({ type: "generate", id, config });
      });
    }
    // Fallback: the first run on the main thread verifies the engine still works
    // when the environment cannot construct module workers.
    const controller = new AbortController();
    this.fallbackController = controller;
    try {
      return await generateWorldAsync(config, onProgress, controller.signal);
    } finally {
      if (this.fallbackController === controller) this.fallbackController = null;
    }
  }

  get mode(): "worker" | "main-thread" {
    return this.worker && !this.workerUnavailable ? "worker" : "main-thread";
  }
}

export const generationClient = new GenerationClient();
