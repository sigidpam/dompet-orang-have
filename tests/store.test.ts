import { describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import { createVaultStore } from '../src/db/store';

describe('vault store', () => {
  it('returns null when no record exists', async () => {
    const store = createVaultStore(`store-${crypto.randomUUID()}`);
    await expect(store.load()).resolves.toBeNull();
  });

  it('throws on a malformed record instead of treating it as empty', async () => {
    const name = `store-${crypto.randomUUID()}`;
    const db = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore('vault');
      },
    });
    await db.put('vault', { iv: 1, ct: 2 }, 'dataset');
    const store = createVaultStore(name);
    await expect(store.load()).rejects.toThrow(/rusak/);
    // The malformed record must remain untouched for manual recovery.
    expect(await db.get('vault', 'dataset')).toEqual({ iv: 1, ct: 2 });
  });
});
