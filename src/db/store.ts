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
    if (!dbPromise) {
      dbPromise = openDB<DompetDB>(dbName, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        },
      }).catch((error: unknown) => {
        // Do not poison every later operation with a transient open failure.
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  return {
    async load(): Promise<EncryptedPayload | null> {
      const db = await getDb();
      const value = await db.get(STORE_NAME, RECORD_KEY);
      if (value === undefined) return null;
      const candidate: unknown = value;
      if (candidate === null || typeof candidate !== 'object') {
        throw new Error(
          'Rekaman vault di IndexedDB rusak. Pulihkan dari backup; data tidak ditimpa.',
        );
      }
      const record = candidate as { iv?: unknown; ct?: unknown };
      if (
        typeof record.iv !== 'string' ||
        typeof record.ct !== 'string' ||
        record.iv.length === 0 ||
        record.ct.length === 0
      ) {
        throw new Error(
          'Rekaman vault di IndexedDB rusak. Pulihkan dari backup; data tidak ditimpa.',
        );
      }
      return { iv: record.iv, ct: record.ct };
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
