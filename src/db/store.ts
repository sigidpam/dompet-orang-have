import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EncryptedPayload } from '../crypto/vault';

interface DompetDB extends DBSchema {
  vault: {
    key: string;
    value: {
      iv: string;
      ct: string;
      updatedAt: string;
    };
  };
}

export interface VaultStore {
  load(): Promise<EncryptedPayload | null>;
  save(payload: EncryptedPayload): Promise<void>;
  clear(): Promise<void>;
}

const DB_VERSION = 1;
const STORE_NAME = 'vault';
const RECORD_KEY = 'dataset';

export function createVaultStore(
  dbName = 'dompet-orang-have',
): VaultStore {
  let dbPromise: Promise<IDBPDatabase<DompetDB>> | null = null;

  function getDb(): Promise<IDBPDatabase<DompetDB>> {
    dbPromise ??= openDB<DompetDB>(dbName, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
    return dbPromise;
  }

  return {
    async load(): Promise<EncryptedPayload | null> {
      const db = await getDb();
      const value = await db.get(STORE_NAME, RECORD_KEY);
      if (
        !value ||
        typeof value.iv !== 'string' ||
        typeof value.ct !== 'string'
      ) {
        return null;
      }
      return { iv: value.iv, ct: value.ct };
    },

    async save(payload: EncryptedPayload): Promise<void> {
      const db = await getDb();
      await db.put(
        STORE_NAME,
        {
          iv: payload.iv,
          ct: payload.ct,
          updatedAt: new Date().toISOString(),
        },
        RECORD_KEY,
      );
    },

    async clear(): Promise<void> {
      const db = await getDb();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      await tx.store.clear();
      await tx.done;
    },
  };
}

export const vaultStore = createVaultStore();
