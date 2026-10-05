// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { runNode } from '../build-community-desktop.mjs';

describe('Community build process deadline', () => {
  it('accepts a completed helper without waiting for its deadline', async () => {
    await expect(runNode('-e', ['process.exit(0)'], { timeoutMs: 10_000 })).resolves.toBeUndefined();
  });

  it('reports an ordinary failure instead of treating it as a successful build', async () => {
    await expect(runNode('-e', ['process.exit(7)'], { timeoutMs: 10_000 }))
      .rejects.toThrow('Community build step failed (7).');
  });

  it('terminates a helper that hangs instead of leaving the build waiting indefinitely', async () => {
    await expect(runNode('-e', ['setInterval(() => {}, 1000)'], { timeoutMs: 1_000 }))
      .rejects.toThrow('Community build step timed out after 1000 ms.');
  }, 10_000);
});
