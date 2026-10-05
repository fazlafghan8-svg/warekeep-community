export interface SerialMutationQueueRef {
    current: Promise<unknown>;
}
export const enqueueSerialMutation = <T>(queueRef: SerialMutationQueueRef, task: () => Promise<T>): Promise<T> => {
    const runAfterPrevious = queueRef.current.catch(() => undefined);
    const next = runAfterPrevious.then(task, task);
    queueRef.current = next.catch(() => undefined);
    return next;
};
