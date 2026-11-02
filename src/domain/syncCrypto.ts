import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';

import { bytesEqual, concatBytes, fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes';

// Encrypting the sync file (SPEC Phase 11). The password is stretched with scrypt
// into a 256-bit key, and the file is sealed with XChaCha20-Poly1305, both from
// the audited @noble libraries. Everything is plain JS, so the phone, the Windows
// app and the tests run the same code and write the same bytes.
//
// The file is a JSON envelope (format 2; the plain sync file is format 1, so an
// older Tally reads it as "written by a newer Tally" and leaves it alone):
//
//   { "app": "tally", "format": 2, "encrypted": {
//       "cipher": "xchacha20poly1305", "kdf": "scrypt", "N": 32768, "r": 8, "p": 1,
//       "salt": "<base64, 16 bytes>", "chunk": 65536,
//       "chunks": ["<base64: 24-byte nonce, ciphertext, 16-byte tag>", ...] } }
//
// The data is cut into 64 KiB chunks, each with its own random nonce, so a big
// history is sealed and opened in slices with the app staying responsive. Every
// chunk authenticates the whole header, its place and the chunk count, so
// changing the parameters, swapping, dropping or repeating chunks is detected.
// One salt belongs to one password: it stays the same across uploads, so the
// derived key can be kept on the device and the slow derivation happens once.

export const SYNC_ENVELOPE_FORMAT = 2;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 256;

export type KdfParams = { N: number; r: number; p: number };

/**
 * scrypt with 16 MiB. Measured in Hermes on an emulator: 3.7 s (2^15 took 7.3 s), so a phone
 * is slower still, and this runs once per device, when the password is entered. The cost is
 * written into the file, so it can be raised later without breaking old files.
 */
export const DEFAULT_KDF: KdfParams = { N: 2 ** 14, r: 8, p: 1 };

/** What a file may ask for: the key derivation must not be a way to hang or crash the device. */
const MAX_KDF_MEMORY = 64 * 1024 * 1024;
const MIN_N = 2 ** 12;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const NONCE_BYTES = 24;
const TAG_BYTES = 16;
export const CHUNK_BYTES = 64 * 1024;
const MAX_CHUNKS = 65_536;

export type SyncRandom = (byteCount: number) => Uint8Array;

/** The key for one password and salt, with what's needed to recognise and redo it. */
export type SyncKey = {
  /** base64, 16 bytes: identifies "this password" in the envelope. */
  salt: string;
  key: Uint8Array;
  kdf: KdfParams;
};

export type EnvelopeHeader = {
  kdf: KdfParams;
  salt: string;
  chunk: number;
  count: number;
};

export type Envelope = { header: EnvelopeHeader; chunks: string[] };

export type EnvelopeProblem = 'newer' | 'invalid';

/** Why a file can't be read as an envelope, or that it isn't one. */
export class EnvelopeError extends Error {
  constructor(readonly problem: EnvelopeProblem) {
    super(`Sync file: ${problem}`);
    this.name = 'EnvelopeError';
  }
}

/** A key that doesn't open the data: a wrong password, or a file that was changed. */
export class DecryptError extends Error {
  constructor() {
    super('The data could not be decrypted');
    this.name = 'DecryptError';
  }
}

// ---------------------------------------------------------------------------
// Passwords and keys

/** The same password typed on another keyboard (composed or separate accents) must give the same key. */
export function normalizePassword(password: string): string {
  try {
    return password.normalize('NFKC');
  } catch {
    return password;
  }
}

export type PasswordProblem = 'tooShort' | 'tooLong' | 'mismatch';

/** An empty password means "no encryption", so only a typed one is checked. `repeat` null skips the match. */
export function checkPassword(password: string, repeat: string | null): PasswordProblem | null {
  if (password === '' && (repeat === null || repeat === '')) return null;
  if (repeat !== null && password !== repeat) return 'mismatch';
  if (normalizePassword(password).length < MIN_PASSWORD_LENGTH) return 'tooShort';
  if (password.length > MAX_PASSWORD_LENGTH) return 'tooLong';
  return null;
}

export function isValidKdf(kdf: KdfParams): boolean {
  const { N, r, p } = kdf;
  return (
    Number.isInteger(N) &&
    N >= MIN_N &&
    (N & (N - 1)) === 0 &&
    Number.isInteger(r) &&
    r >= 1 &&
    r <= 32 &&
    Number.isInteger(p) &&
    p >= 1 &&
    p <= 8 &&
    N * r * 128 <= MAX_KDF_MEMORY
  );
}

/** The slow part. `onProgress` gets 0…1, and the work yields to the app now and then. */
export async function deriveKey(
  password: string,
  salt: Uint8Array,
  kdf: KdfParams,
  onProgress?: (fraction: number) => void,
): Promise<Uint8Array> {
  if (!isValidKdf(kdf)) throw new RangeError('Unsupported key derivation parameters');
  return scryptAsync(utf8Encode(normalizePassword(password)), salt, {
    ...kdf,
    dkLen: KEY_BYTES,
    maxmem: MAX_KDF_MEMORY + 1024 * 1024,
    asyncTick: 20,
    onProgress,
  });
}

/** A key for a new password: a fresh random salt. */
export async function createKey(
  password: string,
  random: SyncRandom,
  kdf: KdfParams = DEFAULT_KDF,
  onProgress?: (fraction: number) => void,
): Promise<SyncKey> {
  const salt = random(SALT_BYTES);
  return { salt: toBase64(salt), key: await deriveKey(password, salt, kdf, onProgress), kdf };
}

/** A key for a password that already protects a file: the salt and cost come from its header. */
export async function keyForHeader(
  password: string,
  header: EnvelopeHeader,
  onProgress?: (fraction: number) => void,
): Promise<SyncKey> {
  const salt = fromBase64(header.salt);
  if (!salt) throw new EnvelopeError('invalid');
  return { salt: header.salt, key: await deriveKey(password, salt, header.kdf, onProgress), kdf: header.kdf };
}

// ---------------------------------------------------------------------------
// The envelope

function aad(header: EnvelopeHeader, index: number): Uint8Array {
  const { kdf, salt, chunk, count } = header;
  return utf8Encode(
    `tally-sync/2\nxchacha20poly1305\nscrypt\n${kdf.N}\n${kdf.r}\n${kdf.p}\n${salt}\n${chunk}\n${count}\n${index}`,
  );
}

/** Lets the app draw a frame between chunks. */
const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function encryptToEnvelope(
  plaintext: string,
  sync: SyncKey,
  random: SyncRandom,
): Promise<string> {
  const data = utf8Encode(plaintext);
  const count = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
  const header: EnvelopeHeader = { kdf: sync.kdf, salt: sync.salt, chunk: CHUNK_BYTES, count };
  const chunks: string[] = [];
  for (let index = 0; index < count; index++) {
    const part = data.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const nonce = random(NONCE_BYTES);
    const sealed = xchacha20poly1305(sync.key, nonce, aad(header, index)).encrypt(part);
    chunks.push(toBase64(concatBytes(nonce, sealed)));
    if (index % 4 === 3) await breathe();
  }
  return JSON.stringify({
    app: 'tally',
    format: SYNC_ENVELOPE_FORMAT,
    encrypted: {
      cipher: 'xchacha20poly1305',
      kdf: 'scrypt',
      N: sync.kdf.N,
      r: sync.kdf.r,
      p: sync.kdf.p,
      salt: sync.salt,
      chunk: CHUNK_BYTES,
      chunks,
    },
  });
}

/**
 * Reads a parsed sync file as an envelope: the envelope, null when it isn't one
 * (it's the plain format), or an EnvelopeError when it claims to be one but isn't
 * valid, or comes from a newer format than this app knows.
 */
export function readEnvelope(raw: unknown): Envelope | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const file = raw as Record<string, unknown>;
  if (file.app !== 'tally' || typeof file.format !== 'number') return null;
  if (file.format > SYNC_ENVELOPE_FORMAT) throw new EnvelopeError('newer');
  if (file.format !== SYNC_ENVELOPE_FORMAT) return null;

  const box = file.encrypted as Record<string, unknown> | null | undefined;
  if (typeof box !== 'object' || box === null) throw new EnvelopeError('invalid');
  const kdf: KdfParams = { N: Number(box.N), r: Number(box.r), p: Number(box.p) };
  const salt = box.salt;
  const chunk = box.chunk;
  const chunks = box.chunks;
  if (
    box.cipher !== 'xchacha20poly1305' ||
    box.kdf !== 'scrypt' ||
    !isValidKdf(kdf) ||
    typeof salt !== 'string' ||
    fromBase64(salt)?.length !== SALT_BYTES ||
    typeof chunk !== 'number' ||
    !Number.isInteger(chunk) ||
    chunk < 1024 ||
    chunk > 1024 * 1024 ||
    !Array.isArray(chunks) ||
    chunks.length < 1 ||
    chunks.length > MAX_CHUNKS ||
    !chunks.every((item) => typeof item === 'string')
  ) {
    throw new EnvelopeError('invalid');
  }
  return { header: { kdf, salt, chunk, count: chunks.length }, chunks: chunks as string[] };
}

/** The plaintext, or a DecryptError when the key is wrong or the file was changed in any way. */
export async function decryptEnvelope(envelope: Envelope, sync: SyncKey): Promise<string> {
  const { header, chunks } = envelope;
  if (sync.salt !== header.salt) throw new DecryptError();
  const parts: Uint8Array[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const bytes = fromBase64(chunks[index]);
    if (
      !bytes ||
      bytes.length < NONCE_BYTES + TAG_BYTES ||
      bytes.length > header.chunk + NONCE_BYTES + TAG_BYTES
    ) {
      throw new DecryptError();
    }
    try {
      parts.push(
        xchacha20poly1305(sync.key, bytes.subarray(0, NONCE_BYTES), aad(header, index)).decrypt(
          bytes.subarray(NONCE_BYTES),
        ),
      );
    } catch {
      throw new DecryptError();
    }
    if (index % 4 === 3) await breathe();
  }
  return utf8Decode(concatBytes(...parts));
}

// ---------------------------------------------------------------------------
// Keeping a key on the device

export type StoredKey = { salt: string; key: string; N: number; r: number; p: number };

export function keyToStored(sync: SyncKey): StoredKey {
  return { salt: sync.salt, key: toBase64(sync.key), ...sync.kdf };
}

/** null for anything that isn't a well-formed key, so a damaged keystore entry just means "no key". */
export function keyFromStored(stored: unknown): SyncKey | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { salt, key, N, r, p } = stored as Record<string, unknown>;
  if (typeof salt !== 'string' || typeof key !== 'string') return null;
  const bytes = fromBase64(key);
  const kdf = { N: Number(N), r: Number(r), p: Number(p) };
  if (!bytes || bytes.length !== KEY_BYTES || fromBase64(salt)?.length !== SALT_BYTES || !isValidKdf(kdf)) {
    return null;
  }
  return { salt, key: bytes, kdf };
}

export function sameKey(a: SyncKey | null, b: SyncKey | null): boolean {
  if (a === null || b === null) return a === b;
  return a.salt === b.salt && bytesEqual(a.key, b.key);
}
