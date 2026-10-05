import { buildReportComputation, resolveSuggestedHomePreset, type SuggestedPresetArgs } from './reportComputation';
import type { BuildReportBundleArgs } from './reporting';
type WorkerRequest = {
    id: number;
    operation: 'build';
    payload: BuildReportBundleArgs;
} | {
    id: number;
    operation: 'suggest';
    payload: SuggestedPresetArgs;
};
type WorkerResponse = {
    id: number;
    ok: true;
    result: unknown;
} | {
    id: number;
    ok: false;
    error: string;
};
const workerScope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
    postMessage: (message: WorkerResponse) => void;
};
workerScope.onmessage = (event) => {
    const request = event.data;
    try {
        const result = request.operation === 'build'
            ? buildReportComputation(request.payload)
            : resolveSuggestedHomePreset(request.payload);
        workerScope.postMessage({ id: request.id, ok: true, result });
    }
    catch (error) {
        workerScope.postMessage({
            id: request.id,
            ok: false,
            error: error instanceof Error ? error.message : 'REPORT_WORKER_FAILED'
        });
    }
};
