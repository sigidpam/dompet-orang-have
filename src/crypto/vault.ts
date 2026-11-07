export const ENVELOPE_STORAGE_KEY = 'dompet.envelope.v1';
export const ATTEMPTS_STORAGE_KEY = 'dompet.attempts.v1';
export const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 2_000_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VAULT_CHECK_TEXT = 'dompet-vault-check-v1';
const AAD_WRAP = 'dompet-wrap-v1';
const AAD_CHECK = 'dompet-check-v1';
const AAD_DATASET = 'dompet-dataset-v1';
const AAD_BACKUP = 'dompet-backup-v1';
const BACKUP_MAGIC = 'dompet-backup';
const PIN_RE = /^\d{6,12}$/;

export type VaultErrorCode =
  | 'invalid-pin'
  | 'invalid-recovery'
  | 'no-vault'
  | 'crypto-unavailable'
  | 'storage-unavailable'
  | 'corrupt'
  | 'invalid-input';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(message: string, code: VaultErrorCode) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

export interface VaultEnvelope {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  wrappedKey: string;
  checkIv: string;
  checkCt: string;
  createdAt: string;
}

export interface EncryptedPayload {
  iv: string;
  ct: string;
}

export interface VaultSession {
  key: CryptoKey;
  rawKey: Uint8Array;
}

export interface BackupFile extends EncryptedPayload {
  app: typeof BACKUP_MAGIC;
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  createdAt: string;
}

export interface VaultOptions {
  iterations?: number;
  now?: () => Date;
}

function subtleCrypto(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new VaultError(
      'Web Crypto tidak tersedia. Buka aplikasi melalui HTTPS atau localhost.',
      'crypto-unavailable',
    );
  }
  return globalThis.crypto.subtle;
}

function randomBytes(length: number): Uint8Array {
  if (!globalThis.crypto?.getRandomValues) {
    throw new VaultError(
      'Generator acak aman tidak tersedia di perangkat ini.',
      'crypto-unavailable',
    );
  }
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new VaultError('Format data terenkripsi tidak valid.', 'corrupt');
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function normalizeSecret(secret: string): string {
  return secret.normalize('NFKC');
}

export function validatePin(pin: string): void {
  if (!PIN_RE.test(pin)) {
    throw new VaultError(
      'PIN harus terdiri dari 6–12 digit angka.',
      'invalid-input',
    );
  }
}

async function deriveKek(
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = subtleCrypto();
  const material = await subtle.importKey(
    'raw',
    encoder.encode(normalizeSecret(pin)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: buffer(salt),
      iterations,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptBytes(
  key: CryptoKey,
  plaintext: Uint8Array,
  aad?: string,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const subtle = subtleCrypto();
  const ct = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: buffer(iv),
      additionalData: aad ? buffer(encoder.encode(aad)) : undefined,
    },
    key,
    buffer(plaintext),
  );
  return { iv: bytesToBase64Url(iv), ct: bytesToBase64Url(new Uint8Array(ct)) };
}

async function decryptBytes(
  key: CryptoKey,
  payload: EncryptedPayload,
  aad?: string,
  errorMessage = 'PIN salah atau data tidak dapat dibuka.',
  errorCode: VaultErrorCode = 'invalid-pin',
): Promise<Uint8Array> {
  const subtle = subtleCrypto();
  const iv = base64UrlToBytes(payload.iv);
  const ct = base64UrlToBytes(payload.ct);
  if (iv.length !== IV_BYTES || ct.length < 16) {
    throw new VaultError(errorMessage, errorCode);
  }
  try {
    const plaintext = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: buffer(iv),
        additionalData: aad ? buffer(encoder.encode(aad)) : undefined,
      },
      key,
      buffer(ct),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new VaultError(errorMessage, errorCode);
  }
}

async function importMasterKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return subtleCrypto().importKey(
    'raw',
    buffer(rawKey),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function wrapAad(iterations: number): string {
  return `${AAD_WRAP}:${iterations}`;
}

function backupAad(salt: string): string {
  return `${AAD_BACKUP}:${salt}`;
}

function readStorage(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    throw new VaultError(
      'Penyimpanan browser tidak dapat diakses. Nonaktifkan mode privat lalu coba lagi.',
      'storage-unavailable',
    );
  }
}

function writeStorage(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    throw new VaultError(
      'Penyimpanan browser tidak dapat diakses. Nonaktifkan mode privat lalu coba lagi.',
      'storage-unavailable',
    );
  }
}

function removeStorage(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Best effort only.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertIterations(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < MIN_ITERATIONS ||
    value > MAX_ITERATIONS
  ) {
    throw new VaultError('Parameter enkripsi tidak valid.', 'corrupt');
  }
  return value;
}

function decodeField(
  record: Record<string, unknown>,
  key: string,
  expectedLength?: number,
  maxLength = 4096,
): string {
  const value = record[key];
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new VaultError('Data enkripsi rusak.', 'corrupt');
  }
  if (expectedLength !== undefined && base64UrlToBytes(value).length !== expectedLength) {
    throw new VaultError('Data enkripsi rusak.', 'corrupt');
  }
  return value;
}

function parseEnvelope(raw: string): VaultEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new VaultError('Data vault rusak dan tidak bisa dibaca.', 'corrupt');
  }
  if (!isRecord(parsed)) {
    throw new VaultError('Data vault rusak dan tidak bisa dibaca.', 'corrupt');
  }
  if (parsed.v !== 1 || parsed.kdf !== 'PBKDF2-SHA256') {
    throw new VaultError('Versi vault tidak didukung.', 'corrupt');
  }
  const iterations = assertIterations(parsed.iterations);
  const salt = decodeField(parsed, 'salt', SALT_BYTES);
  const iv = decodeField(parsed, 'iv', IV_BYTES);
  const wrappedKey = decodeField(parsed, 'wrappedKey');
  const checkIv = decodeField(parsed, 'checkIv', IV_BYTES);
  const checkCt = decodeField(parsed, 'checkCt');
  const createdAt =
    typeof parsed.createdAt === 'string' && !Number.isNaN(Date.parse(parsed.createdAt))
      ? parsed.createdAt
      : new Date(0).toISOString();
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt,
    iv,
    wrappedKey,
    checkIv,
    checkCt,
    createdAt,
  };
}

export function hasVault(): boolean {
  return readStorage(ENVELOPE_STORAGE_KEY) !== null;
}

export function getEnvelope(): VaultEnvelope | null {
  const raw = readStorage(ENVELOPE_STORAGE_KEY);
  return raw ? parseEnvelope(raw) : null;
}

function saveEnvelope(envelope: VaultEnvelope): void {
  writeStorage(ENVELOPE_STORAGE_KEY, JSON.stringify(envelope));
}

export async function createVault(
  pin: string,
  options: VaultOptions = {},
): Promise<VaultSession> {
  validatePin(pin);
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  assertIterations(iterations);
  const salt = randomBytes(SALT_BYTES);
  const rawKey = randomBytes(KEY_BYTES);
  const kek = await deriveKek(pin, salt, iterations);
  const wrapped = await encryptBytes(kek, rawKey, wrapAad(iterations));
  const masterKey = await importMasterKey(rawKey);
  const check = await encryptBytes(
    masterKey,
    encoder.encode(VAULT_CHECK_TEXT),
    AAD_CHECK,
  );
  const now = options.now?.() ?? new Date();

  const envelope: VaultEnvelope = {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: bytesToBase64Url(salt),
    iv: wrapped.iv,
    wrappedKey: wrapped.ct,
    checkIv: check.iv,
    checkCt: check.ct,
    createdAt: now.toISOString(),
  };
  saveEnvelope(envelope);
  clearAttempts();
  return { key: masterKey, rawKey };
}

export async function unlockWithPin(pin: string): Promise<VaultSession> {
  const envelope = getEnvelope();
  if (!envelope) {
    throw new VaultError('Vault belum dibuat di perangkat ini.', 'no-vault');
  }
  const salt = base64UrlToBytes(envelope.salt);
  const kek = await deriveKek(pin, salt, envelope.iterations);
  let rawKey: Uint8Array;
  try {
    rawKey = await decryptBytes(
      kek,
      { iv: envelope.iv, ct: envelope.wrappedKey },
      wrapAad(envelope.iterations),
      'PIN salah.',
      'invalid-pin',
    );
  } catch {
    registerFailedAttempt();
    throw new VaultError('PIN salah.', 'invalid-pin');
  }
  if (rawKey.length !== KEY_BYTES) {
    throw new VaultError('Data vault rusak.', 'corrupt');
  }
  const masterKey = await importMasterKey(rawKey);
  await decryptBytes(
    masterKey,
    { iv: envelope.checkIv, ct: envelope.checkCt },
    AAD_CHECK,
    'Data vault gagal diverifikasi.',
    'corrupt',
  );
  clearAttempts();
  return { key: masterKey, rawKey };
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/\s/g, '');
}

export async function unlockWithRecoveryCode(
  code: string,
): Promise<VaultSession> {
  const envelope = getEnvelope();
  if (!envelope) {
    throw new VaultError('Vault belum dibuat di perangkat ini.', 'no-vault');
  }
  const normalized = normalizeRecoveryCode(code);
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(normalized)) {
    throw new VaultError('Kode pemulihan tidak valid.', 'invalid-recovery');
  }
  const rawKey = base64UrlToBytes(normalized);
  if (rawKey.length !== KEY_BYTES) {
    throw new VaultError('Kode pemulihan tidak valid.', 'invalid-recovery');
  }
  const masterKey = await importMasterKey(rawKey);
  try {
    await decryptBytes(
      masterKey,
      { iv: envelope.checkIv, ct: envelope.checkCt },
      AAD_CHECK,
      'Kode pemulihan salah.',
      'invalid-recovery',
    );
  } catch {
    throw new VaultError('Kode pemulihan salah.', 'invalid-recovery');
  }
  clearAttempts();
  return { key: masterKey, rawKey };
}

export async function changePin(
  session: VaultSession,
  newPin: string,
  options: VaultOptions = {},
): Promise<VaultEnvelope> {
  validatePin(newPin);
  const envelope = getEnvelope();
  if (!envelope) {
    throw new VaultError('Vault belum dibuat di perangkat ini.', 'no-vault');
  }
  // Copy the key before any await. A cross-tab lock or auto-lock can zero the
  // session buffer while PBKDF2 is running; wrapping a zeroed key would destroy
  // the only copy of the master key.
  const rawKey = Uint8Array.from(session.rawKey);
  if (rawKey.length !== KEY_BYTES || rawKey.every((byte) => byte === 0)) {
    rawKey.fill(0);
    throw new VaultError(
      'Sesi sudah terkunci. Buka vault kembali lalu ubah PIN.',
      'no-vault',
    );
  }
  try {
    const iterations = options.iterations ?? envelope.iterations;
    assertIterations(iterations);
    const salt = randomBytes(SALT_BYTES);
    const kek = await deriveKek(newPin, salt, iterations);
    const wrapped = await encryptBytes(kek, rawKey, wrapAad(iterations));
    const updated: VaultEnvelope = {
      ...envelope,
      iterations,
      salt: bytesToBase64Url(salt),
      iv: wrapped.iv,
      wrappedKey: wrapped.ct,
    };
    saveEnvelope(updated);
    clearAttempts();
    return updated;
  } finally {
    rawKey.fill(0);
  }
}

export function getRecoveryCode(session: VaultSession): string {
  return bytesToBase64Url(session.rawKey);
}

export function formatRecoveryCode(code: string): string {
  return (normalizeRecoveryCode(code).match(/.{1,6}/g) ?? []).join(' ');
}

export function lockSession(session: VaultSession): void {
  session.rawKey.fill(0);
}

export function clearVault(): void {
  removeStorage(ENVELOPE_STORAGE_KEY);
  removeStorage(ATTEMPTS_STORAGE_KEY);
}

export async function encryptDataset(
  session: VaultSession,
  dataset: unknown,
): Promise<EncryptedPayload> {
  return encryptBytes(
    session.key,
    encoder.encode(JSON.stringify(dataset)),
    AAD_DATASET,
  );
}

export async function decryptDataset<T>(
  session: VaultSession,
  payload: EncryptedPayload,
  validate: (value: unknown) => T,
): Promise<T> {
  if (
    typeof payload.iv !== 'string' ||
    typeof payload.ct !== 'string' ||
    payload.ct.length > 50_000_000
  ) {
    throw new VaultError('Data terenkripsi tidak valid.', 'corrupt');
  }
  const plaintext = await decryptBytes(
    session.key,
    payload,
    AAD_DATASET,
    'Data vault tidak dapat didekripsi.',
    'corrupt',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new VaultError('Data vault bukan JSON yang valid.', 'corrupt');
  }
  return validate(parsed);
}

export async function createBackup(
  dataset: unknown,
  passphrase: string,
  iterations = DEFAULT_ITERATIONS,
  now = new Date(),
): Promise<BackupFile> {
  const normalized = passphrase.trim();
  if (normalized.length < 8 || normalized.length > 256) {
    throw new VaultError(
      'Frasa sandi backup harus 8–256 karakter.',
      'invalid-input',
    );
  }
  assertIterations(iterations);
  const saltBytes = randomBytes(SALT_BYTES);
  const salt = bytesToBase64Url(saltBytes);
  const kek = await deriveKek(normalized, saltBytes, iterations);
  const plaintext = encoder.encode(
    JSON.stringify({
      magic: BACKUP_MAGIC,
      v: 1,
      exportedAt: now.toISOString(),
      dataset,
    }),
  );
  const encrypted = await encryptBytes(kek, plaintext, backupAad(salt));
  return {
    app: BACKUP_MAGIC,
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt,
    createdAt: now.toISOString(),
    ...encrypted,
  };
}

export async function openBackup<T>(
  input: unknown,
  passphrase: string,
  validate: (value: unknown) => T,
): Promise<T> {
  if (!isRecord(input) || input.app !== BACKUP_MAGIC || input.v !== 1) {
    throw new VaultError('File backup tidak dikenal.', 'corrupt');
  }
  if (input.kdf !== 'PBKDF2-SHA256') {
    throw new VaultError('Format backup tidak didukung.', 'corrupt');
  }
  const iterations = assertIterations(input.iterations);
  const salt = decodeField(input, 'salt', SALT_BYTES);
  const iv = decodeField(input, 'iv', IV_BYTES);
  const ct = decodeField(input, 'ct', undefined, 30_000_000);
  const kek = await deriveKek(passphrase.trim(), base64UrlToBytes(salt), iterations);
  const plaintext = await decryptBytes(
    kek,
    { iv, ct },
    backupAad(salt),
    'Frasa sandi backup salah atau file rusak.',
    'invalid-input',
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new VaultError('Isi backup bukan JSON yang valid.', 'corrupt');
  }
  if (!isRecord(parsed) || parsed.magic !== BACKUP_MAGIC || parsed.v !== 1) {
    throw new VaultError('Isi backup tidak dikenal.', 'corrupt');
  }
  return validate(parsed.dataset);
}

export interface AttemptState {
  failures: number;
  until: number;
}

export function readAttemptState(): AttemptState {
  let raw: string | null;
  try {
    raw = readStorage(ATTEMPTS_STORAGE_KEY);
  } catch {
    return { failures: 0, until: 0 };
  }
  if (!raw) return { failures: 0, until: 0 };
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const failures =
      typeof parsed.failures === 'number' &&
      Number.isSafeInteger(parsed.failures) &&
      parsed.failures >= 0
        ? parsed.failures
        : 0;
    const until =
      typeof parsed.until === 'number' && Number.isFinite(parsed.until)
        ? parsed.until
        : 0;
    return { failures, until };
  } catch {
    return { failures: 0, until: 0 };
  }
}

export function lockoutRemainingMs(now = Date.now()): number {
  const { until } = readAttemptState();
  return Math.max(0, until - now);
}

export function registerFailedAttempt(now = Date.now()): AttemptState {
  const current = readAttemptState();
  const failures = current.failures + 1;
  let until = 0;
  if (failures >= 5) {
    const delay = Math.min(15 * 60_000, 30_000 * 2 ** (failures - 5));
    until = now + delay;
  }
  const next = { failures, until };
  try {
    writeStorage(ATTEMPTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Throttling is best-effort; encryption remains the real control.
  }
  return next;
}

export function clearAttempts(): void {
  removeStorage(ATTEMPTS_STORAGE_KEY);
}
