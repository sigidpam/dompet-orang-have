import { beforeEach, describe, expect, it } from 'vitest';
import {
  ENVELOPE_STORAGE_KEY,
  VaultError,
  changePin,
  clearAttempts,
  clearVault,
  createBackup,
  createVault,
  decryptDataset,
  encryptDataset,
  formatRecoveryCode,
  getEnvelope,
  getRecoveryCode,
  hasVault,
  lockSession,
  lockoutRemainingMs,
  normalizeRecoveryCode,
  openBackup,
  readAttemptState,
  registerFailedAttempt,
  unlockWithPin,
  unlockWithRecoveryCode,
} from '../src/crypto/vault';

const FAST = { iterations: 1_000 };

describe('vault encryption', () => {
  beforeEach(() => {
    clearVault();
    clearAttempts();
  });

  it('creates an envelope without storing the PIN', async () => {
    const session = await createVault('123456', FAST);
    expect(hasVault()).toBe(true);
    const envelope = getEnvelope();
    expect(envelope).not.toBeNull();
    expect(envelope?.kdf).toBe('PBKDF2-SHA256');
    expect(envelope?.iterations).toBe(1_000);
    const stored = JSON.parse(
      globalThis.localStorage.getItem(ENVELOPE_STORAGE_KEY) ?? '{}',
    ) as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(
      [
        'checkCt',
        'checkIv',
        'createdAt',
        'iterations',
        'iv',
        'kdf',
        'salt',
        'v',
        'wrappedKey',
      ].sort(),
    );
    expect(JSON.stringify(stored)).not.toContain('123456');
    expect(Object.values(stored)).not.toContain('123456');
    lockSession(session);
  });

  it('unlocks with the correct PIN and rejects the wrong one', async () => {
    const session = await createVault('123456', FAST);
    await expect(unlockWithPin('000000')).rejects.toMatchObject({
      code: 'invalid-pin',
    });
    const unlocked = await unlockWithPin('123456');
    expect(unlocked.rawKey).toHaveLength(32);
    lockSession(session);
    lockSession(unlocked);
  });

  it('round-trips encrypted datasets and detects tampering', async () => {
    const session = await createVault('123456', FAST);
    const payload = await encryptDataset(session, { hello: 'dunia', n: 42 });
    const unlocked = await unlockWithPin('123456');
    const data = await decryptDataset(unlocked, payload, (value) => value);
    expect(data).toEqual({ hello: 'dunia', n: 42 });

    const tampered = {
      iv: payload.iv,
      ct: `${payload.ct[0] === 'A' ? 'B' : 'A'}${payload.ct.slice(1)}`,
    };
    await expect(
      decryptDataset(unlocked, tampered, (value) => value),
    ).rejects.toBeInstanceOf(VaultError);
    lockSession(session);
    lockSession(unlocked);
  });

  it('rejects a corrupted envelope', async () => {
    await createVault('123456', FAST);
    globalThis.localStorage.setItem(
      ENVELOPE_STORAGE_KEY,
      JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iterations: 1 }),
    );
    await expect(unlockWithPin('123456')).rejects.toBeInstanceOf(VaultError);
  });

  it('changes the PIN while keeping the same data key', async () => {
    const session = await createVault('123456', FAST);
    const payload = await encryptDataset(session, { keep: true });
    await changePin(session, '654321', FAST);
    await expect(unlockWithPin('123456')).rejects.toBeInstanceOf(VaultError);
    const unlocked = await unlockWithPin('654321');
    const data = await decryptDataset(unlocked, payload, (value) => value);
    expect(data).toEqual({ keep: true });
    lockSession(session);
    lockSession(unlocked);
  });

  it('does not wrap a zeroed key when a lock races PIN change', async () => {
    const session = await createVault('123456', FAST);
    const payload = await encryptDataset(session, { survived: true });
    const changing = changePin(session, '654321', FAST);
    // Simulate another tab's lock or auto-lock zeroing the live session while
    // PBKDF2 is still running inside changePin.
    lockSession(session);
    await changing;
    const unlocked = await unlockWithPin('654321');
    const data = await decryptDataset(unlocked, payload, (value) => value);
    expect(data).toEqual({ survived: true });
    lockSession(unlocked);
  });

  it('unlocks with a recovery code and formats it safely', async () => {
    const session = await createVault('123456', FAST);
    const raw = getRecoveryCode(session);
    const formatted = formatRecoveryCode(raw);
    expect(formatted).toContain(' ');
    expect(normalizeRecoveryCode(formatted)).toBe(raw);
    const recovered = await unlockWithRecoveryCode(`  ${formatted}  `);
    expect(recovered.rawKey).toEqual(session.rawKey);
    await expect(
      unlockWithRecoveryCode('x'.repeat(43)),
    ).rejects.toMatchObject({ code: 'invalid-recovery' });
    lockSession(session);
    lockSession(recovered);
  });

  it('creates encrypted backups with a separate passphrase', async () => {
    const backup = await createBackup(
      { accounts: [] },
      'correct horse battery',
      1_000,
      new Date('2026-11-07T00:00:00.000Z'),
    );
    expect(backup.app).toBe('dompet-backup');
    expect(JSON.stringify(backup)).not.toContain('accounts');
    const opened = await openBackup(
      backup,
      'correct horse battery',
      (value) => value,
    );
    expect(opened).toEqual({ accounts: [] });
    await expect(
      openBackup(backup, 'wrong passphrase', (value) => value),
    ).rejects.toBeInstanceOf(VaultError);
  });

  it('rejects tampered backup ciphertext', async () => {
    const backup = await createBackup({ ok: true }, 'passphrase123', 1_000);
    const tampered = {
      ...backup,
      ct: `${backup.ct[0] === 'A' ? 'B' : 'A'}${backup.ct.slice(1)}`,
    };
    await expect(
      openBackup(tampered, 'passphrase123', (value) => value),
    ).rejects.toBeInstanceOf(VaultError);
  });

  it('handles backups larger than the envelope field limit', async () => {
    const payload = { blob: 'x'.repeat(10_000) };
    const backup = await createBackup(payload, 'passphrase123', 1_000);
    expect(backup.ct.length).toBeGreaterThan(4_096);
    await expect(
      openBackup(backup, 'passphrase123', (value) => value),
    ).resolves.toEqual(payload);
  });

  it('throttles repeated failures after five attempts', () => {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      registerFailedAttempt(1_000);
      expect(readAttemptState().failures).toBe(attempt);
    }
    expect(lockoutRemainingMs(1_000)).toBe(0);
    registerFailedAttempt(1_000);
    expect(lockoutRemainingMs(1_000)).toBeGreaterThan(0);
    expect(lockoutRemainingMs(1_000 + 31_000)).toBe(0);
    clearAttempts();
    expect(readAttemptState().failures).toBe(0);
  });

  it('can verify an old PIN without touching the lock-screen counter', async () => {
    await createVault('123456', FAST);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await expect(
        unlockWithPin('000000', { registerFailure: false }),
      ).rejects.toMatchObject({ code: 'invalid-pin' });
    }
    expect(readAttemptState().failures).toBe(0);
  });
});
