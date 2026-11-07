export function newId(prefix: string): string {
  let uuid: string;
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    uuid = globalThis.crypto.randomUUID();
  } else {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    uuid = [...bytes]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }
  return `${prefix}_${uuid}`;
}
