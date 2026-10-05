import { buildReportComputation, resolveSuggestedHomePreset, type SuggestedPresetArgs } from './reportComputation';
import type { BuildReportBundleArgs, ReportBundle, ReportPreset } from './reporting';
type CancelableComputation<T> = {
    promise: Promise<T>;
    cancel: () => void;
    usedWorker: boolean;
};
let requestSequence = 0;
const runWorkerComputation = <T>(operation: 'build' | 'suggest', payload: BuildReportBundleArgs | SuggestedPresetArgs, fallback: () => T): CancelableComputation<T> => {
    if (typeof Worker === 'undefined') {
        return {
            promise: Promise.resolve().then(fallback),
            cancel: () => undefined,
            usedWorker: false
        };
    }
    const id = ++requestSequence;
    let worker: Worker;
    try {
        worker = new Worker(new URL('./reportComputation.worker.ts', import.meta.url), { type: 'module' });
    }
    catch {
        return {
            promise: Promise.resolve().then(fallback),
            cancel: () => undefined,
            usedWorker: false
        };
    }
    let cancelled = false;
    const promise = new Promise<T>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<{
            id: number;
            ok: boolean;
            result?: T;
            error?: string;
        }>) => {
            if (event.data.id !== id || cancelled)
                return;
            worker.terminate();
            if (event.data.ok)
                resolve(event.data.result as T);
            else
                reject(new Error(event.data.error || 'REPORT_WORKER_FAILED'));
        };
        worker.onerror = () => {
            worker.terminate();
            if (cancelled)
                return;
            try {
                resolve(fallback());
            }
            catch (error) {
                reject(error);
            }
        };
        try {
            worker.postMessage({ id, operation, payload });
        }
        catch {
            worker.terminate();
            if (cancelled)
                return;
            try {
                resolve(fallback());
            }
            catch (error) {
                reject(error);
            }
        }
    });
    return {
        promise,
        usedWorker: true,
        cancel: () => {
            cancelled = true;
            worker.terminate();
        }
    };
};
export const calculateReportAsync = (args: BuildReportBundleArgs) => runWorkerComputation<ReportBundle>('build', args, () => buildReportComputation(args));
export const calculateSuggestedPresetAsync = (args: SuggestedPresetArgs) => runWorkerComputation<ReportPreset>('suggest', args, () => resolveSuggestedHomePreset(args));
