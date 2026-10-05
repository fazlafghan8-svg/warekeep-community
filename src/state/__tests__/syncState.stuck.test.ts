import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  setSyncStatus,
  setSyncStatusReady,
  getSyncStatus,
  getSyncingSinceMs,
  reconcileSyncStatus,
  clearSyncError,
  setSyncError,
} from '../syncState';

describe('syncState stuck-syncing protection', () => {
  beforeEach(() => {
    // Reset to a known state
    setSyncStatus('offline');
    clearSyncError();
  });

  it('tracks how long sync has been in syncing state', () => {
    setSyncStatus('syncing');
    const elapsed = getSyncingSinceMs();
    // Should be very small (just set)
    expect(elapsed).toBeGreaterThanOrEqual(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it('resets syncing timer when status changes away from syncing', () => {
    setSyncStatus('syncing');
    expect(getSyncingSinceMs()).toBeGreaterThanOrEqual(0);

    setSyncStatusReady(); // -> 'ok'
    expect(getSyncingSinceMs()).toBe(0);
  });

  it('returns 0 for getSyncingSinceMs when not syncing', () => {
    setSyncStatus('offline');
    expect(getSyncingSinceMs()).toBe(0);
  });

  it('transitions from syncing to ok on setSyncStatusReady', () => {
    setSyncStatus('syncing');
    expect(getSyncStatus()).toBe('syncing');

    setSyncStatusReady();
    expect(getSyncStatus()).toBe('ok');
  });

  it('transitions from syncing to offline on setSyncStatus offline', () => {
    setSyncStatus('syncing');
    expect(getSyncStatus()).toBe('syncing');

    setSyncStatus('offline');
    expect(getSyncStatus()).toBe('offline');
  });

  it('reconcileSyncStatus clears stuck syncing when no active sync', () => {
    setSyncStatus('syncing');
    setSyncError('some timeout', { code: 'NETWORK_OFFLINE', source: 'test' });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 10,
      remoteVersion: 10,
    });

    expect(repaired).toBe(true);
    expect(getSyncStatus()).toBe('ok');
  });

  it('reconcileSyncStatus respects active sync when not stuck', () => {
    setSyncStatus('syncing');
    // No error, active sync, not stuck (just started)
    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: true,
      localVersion: 10,
      remoteVersion: 10,
    });

    // Should NOT repair — sync is legitimately running
    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('syncing');
  });

  it('reconcileSyncStatus clears offline status with transient error', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', { code: 'NETWORK_OFFLINE', source: 'test' });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 15,
      remoteVersion: 15,
    });

    expect(repaired).toBe(true);
    expect(getSyncStatus()).toBe('ok');
  });

  it('does not reconcile offline with non-transient error', () => {
    setSyncStatus('offline');
    setSyncError('Device is not trusted', { code: 'DEVICE_UNTRUSTED', source: 'test' });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 15,
      remoteVersion: 15,
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('offline');
  });

  it('does not reconcile when local version behind remote', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', { code: 'NETWORK_OFFLINE', source: 'test' });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 5,
      remoteVersion: 15,
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('offline');
  });

  it('does not reconcile when queue has pending items', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', { code: 'NETWORK_OFFLINE', source: 'test' });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 3,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 15,
      remoteVersion: 15,
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('offline');
  });
});
