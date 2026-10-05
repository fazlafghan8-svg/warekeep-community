import { afterEach, describe, expect, it, vi } from 'vitest';

const originalCrypto = globalThis.crypto;

afterEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: originalCrypto,
  });
  vi.restoreAllMocks();
});

describe('createUniqueId', () => {
  it('uses crypto.randomUUID with a sanitized prefix', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: vi.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
      },
    });

    const { createUniqueId } = await import('../localIds');

    expect(createUniqueId(' med create ')).toBe('med-create-123e4567-e89b-12d3-a456-426614174000');
  });

  it('generates unique IDs when randomUUID is unavailable but getRandomValues exists', async () => {
    let seed = 0;
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        getRandomValues: vi.fn((bytes: Uint8Array) => {
          for (let index = 0; index < bytes.length; index += 1) {
            bytes[index] = (seed + index) % 255;
          }
          seed += 17;
          return bytes;
        }),
      },
    });

    const { createUniqueId } = await import('../localIds');
    const first = createUniqueId('q');
    const second = createUniqueId('q');

    expect(first).toMatch(/^q-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).toMatch(/^q-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });

  it('fails closed instead of using time or Math.random when secure crypto is unavailable', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {},
    });

    const { createUniqueId } = await import('../localIds');

    expect(() => createUniqueId('q')).toThrow('SECURE_RANDOM_UNAVAILABLE');
  });
});
