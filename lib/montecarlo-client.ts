// Main-thread entry point for the Monte Carlo engine: runs it in a Web Worker,
// and synchronously on this thread when workers are unavailable or fail to load.
import { runMonteCarlo, type MonteCarloParams, type MonteCarloResult } from './montecarlo';

type Reply = { id: number; result: MonteCarloResult } | { id: number; error: string };
type Pending = { params: MonteCarloParams; resolve: (r: MonteCarloResult) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function runHere(params: MonteCarloParams): Promise<MonteCarloResult> {
    // Defer one frame so a loading state can paint before the synchronous run.
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            try {
                resolve(runMonteCarlo(params));
            } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
            }
        }, 16);
    });
}

function getWorker(): Worker | null {
    if (workerBroken || typeof Worker === 'undefined') return null;
    if (worker) return worker;
    try {
        worker = new Worker(new URL('./montecarlo.worker.ts', import.meta.url));
    } catch {
        workerBroken = true;
        return null;
    }
    worker.onmessage = (event: MessageEvent<Reply>) => {
        const job = pending.get(event.data.id);
        if (!job) return;
        pending.delete(event.data.id);
        if ('error' in event.data) job.reject(new Error(event.data.error));
        else job.resolve(event.data.result);
    };
    worker.onerror = () => {
        // The worker script itself failed (e.g. could not load): stop using it and finish the queued runs here.
        workerBroken = true;
        worker?.terminate();
        worker = null;
        const jobs = [...pending.values()];
        pending.clear();
        for (const job of jobs) runHere(job.params).then(job.resolve, job.reject);
    };
    return worker;
}

export function runMonteCarloAsync(params: MonteCarloParams): Promise<MonteCarloResult> {
    const w = getWorker();
    if (!w) return runHere(params);
    const id = ++nextId;
    return new Promise((resolve, reject) => {
        pending.set(id, { params, resolve, reject });
        w.postMessage({ id, params });
    });
}
