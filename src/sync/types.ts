export type SyncEntity = 'note' | 'task' | 'setting' | 'medicine' | 'customer' | 'invoice' | 'expense' | 'supplier' | 'purchase' | 'partner' | 'snapshot';
export type SyncAction = 'insert' | 'update' | 'delete';
export type SyncOperation = {
    entity: SyncEntity;
    entity_id: string;
    action: SyncAction;
    payload: any;
    version: number;
    updated_at: string;
    source_device_id: string;
};
