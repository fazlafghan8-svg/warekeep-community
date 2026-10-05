import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSyncError,
  getSyncError,
  getSyncStatus,
  reconcileSyncStatus,
  restoreSyncStatusOk,
  setSyncError,
  setSyncStatus
} from '../syncState';

describe('syncState recovery helpers', () => {
  beforeEach(() => {
    clearSyncError();
    restoreSyncStatusOk();
  });

  it('restores ok without discarding the active error immediately', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', {
      code: 'SYNC_LOOP_FAILED',
      source: 'hybridSync.runSyncLoop'
    });

    restoreSyncStatusOk();

    expect(getSyncStatus()).toBe('ok');
    expect(getSyncError()).toMatchObject({
      code: 'SYNC_LOOP_FAILED',
      message: 'NETWORK_TIMEOUT'
    });
  });

  it('reconciles a stale offline timeout after local and remote versions match', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', {
      code: 'SYNC_LOOP_FAILED',
      source: 'hybridSync.runSyncLoop'
    });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      localVersion: 281,
      remoteVersion: 281
    });

    expect(repaired).toBe(true);
    expect(getSyncStatus()).toBe('ok');
    expect(getSyncError()).toBeNull();
  });

  it('does not reconcile while pending queue items still need to sync', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', {
      code: 'SYNC_LOOP_FAILED',
      source: 'hybridSync.runSyncLoop'
    });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 1,
      isProcessing: false,
      isPaused: false,
      localVersion: 281,
      remoteVersion: 281
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('offline');
    expect(getSyncError()).toMatchObject({
      code: 'SYNC_LOOP_FAILED',
      message: 'NETWORK_TIMEOUT'
    });
  });

  it('does not mark sync healthy when the local cursor is ahead of the server', () => {
    setSyncStatus('offline');
    setSyncError('NETWORK_TIMEOUT', {
      code: 'SYNC_LOOP_FAILED',
      source: 'hybridSync.runSyncLoop'
    });

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      localVersion: Date.parse('2026-05-07T08:30:00.000Z'),
      remoteVersion: 8
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('offline');
    expect(getSyncError()).toMatchObject({
      code: 'SYNC_LOOP_FAILED',
      message: 'NETWORK_TIMEOUT'
    });
  });

  it('repairs a stale syncing status after work has already finished', () => {
    restoreSyncStatusOk();
    setSyncStatus('syncing');

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: false,
      localVersion: 281,
      remoteVersion: 281
    });

    expect(repaired).toBe(true);
    expect(getSyncStatus()).toBe('ok');
    expect(getSyncError()).toBeNull();
  });

  it('keeps syncing state while a real sync loop is still active', () => {
    restoreSyncStatusOk();
    setSyncStatus('syncing');

    const repaired = reconcileSyncStatus({
      online: true,
      queueLength: 0,
      isProcessing: false,
      isPaused: false,
      hasActiveSync: true,
      localVersion: 281,
      remoteVersion: 281
    });

    expect(repaired).toBe(false);
    expect(getSyncStatus()).toBe('syncing');
  });
});
