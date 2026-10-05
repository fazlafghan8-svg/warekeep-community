/** Local identifier for audit records; never registered with an online account. */
export const getDeviceId = (): string => {
    const key = 'warekeep_community_device_id';
    let id = localStorage.getItem(key);
    if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(key, id);
    }
    return id;
};
