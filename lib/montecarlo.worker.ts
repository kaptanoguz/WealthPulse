// Runs the Monte Carlo engine off the main thread so the page stays responsive.
import { runMonteCarlo, type MonteCarloParams } from './montecarlo';

export interface WorkerRequest {
    id: number;
    params: MonteCarloParams;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const { id, params } = event.data;
    try {
        const result = runMonteCarlo(params);
        // The two final-value arrays are the bulk of the payload; hand them over instead of copying.
        (self as unknown as Worker).postMessage({ id, result }, [result.finalNominal.buffer, result.finalReal.buffer]);
    } catch (err) {
        (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    }
};
