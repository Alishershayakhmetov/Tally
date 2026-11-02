import { randomBytes, scryptSync } from 'node:crypto';

import { bytesEqual, concatBytes, fromBase64, toBase64, utf8DecodeByHand, utf8EncodeByHand } from '../bytes';
import {
  checkPassword,
  CHUNK_BYTES,
  createKey,
  DecryptError,
  decryptEnvelope,
  deriveKey,
  encryptToEnvelope,
  EnvelopeError,
  isValidKdf,
  keyForHeader,
  keyFromStored,
  keyToStored,
  normalizePassword,
  readEnvelope,
  sameKey,
  type KdfParams,
  type SyncKey,
} from '../syncCrypto';

// The smallest cost a file may ask for, so the tests stay fast.
const FAST: KdfParams = { N: 2 ** 12, r: 8, p: 1 };
const random = (n: number) => new Uint8Array(randomBytes(n));

async function envelopeOf(text: string, key: SyncKey) {
  const sealed = JSON.parse(await encryptToEnvelope(text, key, random));
  const envelope = readEnvelope(sealed);
  if (!envelope) throw new Error('not an envelope');
  return { sealed, envelope };
}

describe('base64', () => {
  it('matches Node for every length, and reads back', () => {
    for (let length = 0; length < 70; length++) {
      const bytes = new Uint8Array(randomBytes(length));
      const text = toBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(fromBase64(text) ?? [])).toEqual(Array.from(bytes));
    }
    const big = new Uint8Array(randomBytes(100_000));
    expect(toBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });

  it('rejects anything that is not strict base64', () => {
    for (const text of ['A', 'AA', 'AAA', 'AAAAA', 'AA=A', 'A===', '=AAA', 'AA A', 'ÄÄÄÄ', 'AAA-']) {
      expect(fromBase64(text)).toBeNull();
    }
    expect(fromBase64('')).toEqual(new Uint8Array());
  });
});

describe('UTF-8 by hand', () => {
  const samples = ['', 'plain', 'Отжимания 💪', 'ñ é ü', '日本語', '😀😁😂🤣', 'a\u0000b', '\u{10FFFF}'];

  it('agrees with TextEncoder / TextDecoder', () => {
    for (const text of samples) {
      const bytes = new TextEncoder().encode(text);
      expect(Array.from(utf8EncodeByHand(text))).toEqual(Array.from(bytes));
      expect(utf8DecodeByHand(bytes)).toBe(text);
    }
  });

  it('turns a lone surrogate into U+FFFD, and bad bytes too, like TextDecoder', () => {
    expect(Array.from(utf8EncodeByHand('a\ud800b'))).toEqual(
      Array.from(new TextEncoder().encode('a\ud800b')),
    );
    for (const bad of [
      [0xff],
      [0xc0, 0x80],
      [0xe0, 0x80, 0x80],
      [0xed, 0xa0, 0x80],
      [0xf4, 0x90, 0x80, 0x80],
      [0xc3],
      [0xe2, 0x82],
    ]) {
      const bytes = Uint8Array.from(bad);
      expect(utf8DecodeByHand(bytes)).toBe(new TextDecoder().decode(bytes));
    }
  });

  it('handles long text', () => {
    const text = 'Отжимания 💪 '.repeat(5000);
    expect(utf8DecodeByHand(utf8EncodeByHand(text))).toBe(text);
  });
});

describe('bytes helpers', () => {
  it('concatenates and compares', () => {
    expect(Array.from(concatBytes(Uint8Array.of(1), new Uint8Array(), Uint8Array.of(2, 3)))).toEqual([
      1, 2, 3,
    ]);
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 2))).toBe(true);
    expect(bytesEqual(Uint8Array.of(1, 2), Uint8Array.of(1, 3))).toBe(false);
    expect(bytesEqual(Uint8Array.of(1), Uint8Array.of(1, 2))).toBe(false);
  });
});

describe('passwords', () => {
  it('treats empty as "no encryption" and checks a typed one', () => {
    expect(checkPassword('', '')).toBeNull();
    expect(checkPassword('', null)).toBeNull();
    expect(checkPassword('', 'x')).toBe('mismatch');
    expect(checkPassword('longenough', 'longenough')).toBeNull();
    expect(checkPassword('longenough', 'different!')).toBe('mismatch');
    expect(checkPassword('short', 'short')).toBe('tooShort');
    expect(checkPassword('1234567', null)).toBe('tooShort');
    expect(checkPassword('x'.repeat(257), 'x'.repeat(257))).toBe('tooLong');
  });

  it('gives one key to composed and separate accents', async () => {
    const composed = 'café-пароль';
    const separate = 'café-пароль';
    expect(composed).not.toBe(separate);
    expect(normalizePassword(separate)).toBe(normalizePassword(composed));
    const salt = new Uint8Array(randomBytes(16));
    expect(Array.from(await deriveKey(composed, salt, FAST))).toEqual(
      Array.from(await deriveKey(separate, salt, FAST)),
    );
  });
});

describe('key derivation', () => {
  it('is standard scrypt, so nothing about it is special to this app', async () => {
    const salt = new Uint8Array(randomBytes(16));
    const ours = await deriveKey('correct horse battery', salt, FAST);
    const theirs = scryptSync('correct horse battery', salt, 32, { N: FAST.N, r: FAST.r, p: FAST.p });
    expect(Array.from(ours)).toEqual(Array.from(theirs));
  });

  it('reports progress and refuses costs a file must not ask for', async () => {
    const progress: number[] = [];
    await deriveKey('pw-12345678', new Uint8Array(16), FAST, (fraction) => progress.push(fraction));
    expect(progress.length).toBeGreaterThan(0);
    expect(Math.max(...progress)).toBeLessThanOrEqual(1);
    expect(isValidKdf(FAST)).toBe(true);
    for (const bad of [
      { N: 2 ** 11, r: 8, p: 1 },
      { N: 3 * 2 ** 12, r: 8, p: 1 },
      { N: 2 ** 20, r: 8, p: 1 },
      { N: 2 ** 16, r: 16, p: 1 },
      { N: 2 ** 12, r: 8, p: 0 },
      { N: 2 ** 12, r: 8, p: 9 },
      { N: 2 ** 12, r: 0, p: 1 },
      { N: 2.5, r: 8, p: 1 },
    ]) {
      expect(isValidKdf(bad)).toBe(false);
    }
    await expect(deriveKey('pw', new Uint8Array(16), { N: 2 ** 20, r: 8, p: 1 })).rejects.toThrow(RangeError);
  });

  it('keeps and restores a key', async () => {
    const key = await createKey('pw-12345678', random, FAST);
    expect(key.salt).toHaveLength(24);
    const restored = keyFromStored(JSON.parse(JSON.stringify(keyToStored(key))));
    expect(sameKey(restored, key)).toBe(true);
    expect(sameKey(key, await createKey('pw-12345678', random, FAST))).toBe(false);
    expect(sameKey(null, null)).toBe(true);
    expect(sameKey(null, key)).toBe(false);
    for (const bad of [
      null,
      5,
      {},
      { ...keyToStored(key), key: 'AAAA' },
      { ...keyToStored(key), salt: 'AAAA' },
      { ...keyToStored(key), N: 7 },
    ]) {
      expect(keyFromStored(bad)).toBeNull();
    }
  });
});

describe('the envelope', () => {
  const text = JSON.stringify({ tasks: ['Отжимания 💪', 'x'.repeat(100)] });

  it('seals and opens text, from empty to many chunks', async () => {
    const key = await createKey('pw-12345678', random, FAST);
    for (const sample of ['', 'a', text, 'Ж'.repeat(CHUNK_BYTES), 'q'.repeat(CHUNK_BYTES * 3 + 5)]) {
      const { envelope } = await envelopeOf(sample, key);
      expect(await decryptEnvelope(envelope, key)).toBe(sample);
      expect(envelope.header.count).toBe(
        Math.max(1, Math.ceil(new TextEncoder().encode(sample).length / CHUNK_BYTES)),
      );
    }
  });

  it('writes the documented shape, without the plaintext in it', async () => {
    const key = await createKey('pw-12345678', random, FAST);
    const { sealed } = await envelopeOf(text, key);
    expect(Object.keys(sealed)).toEqual(['app', 'format', 'encrypted']);
    expect(sealed).toMatchObject({
      app: 'tally',
      format: 2,
      encrypted: {
        cipher: 'xchacha20poly1305',
        kdf: 'scrypt',
        N: 4096,
        r: 8,
        p: 1,
        salt: key.salt,
        chunk: CHUNK_BYTES,
      },
    });
    expect(JSON.stringify(sealed)).not.toContain('Отжимания');
    // Fresh nonces: sealing the same text twice gives different bytes.
    const again = await envelopeOf(text, key);
    expect(again.sealed.encrypted.chunks[0]).not.toBe(sealed.encrypted.chunks[0]);
  });

  it('opens with a key made again from the password and the file’s own header', async () => {
    const key = await createKey('pw-12345678', random, FAST);
    const { envelope } = await envelopeOf(text, key);
    const again = await keyForHeader('pw-12345678', envelope.header);
    expect(await decryptEnvelope(envelope, again)).toBe(text);
    const wrong = await keyForHeader('pw-87654321', envelope.header);
    await expect(decryptEnvelope(envelope, wrong)).rejects.toThrow(DecryptError);
  });

  it('refuses a key from another password (another salt)', async () => {
    const key = await createKey('pw-12345678', random, FAST);
    const other = await createKey('pw-12345678', random, FAST);
    const { envelope } = await envelopeOf(text, key);
    await expect(decryptEnvelope(envelope, other)).rejects.toThrow(DecryptError);
  });

  describe('any change to the file is noticed', () => {
    const many = 'z'.repeat(CHUNK_BYTES * 3 + 10);
    async function sealed() {
      const key = await createKey('pw-12345678', random, FAST);
      const made = await envelopeOf(many, key);
      return { key, file: made.sealed, open: (file: unknown) => decryptEnvelope(readEnvelope(file)!, key) };
    }

    it('a flipped character in a chunk', async () => {
      const { file, open } = await sealed();
      const chunk = file.encrypted.chunks[1] as string;
      file.encrypted.chunks[1] = `${chunk.slice(0, 40)}${chunk[40] === 'A' ? 'B' : 'A'}${chunk.slice(41)}`;
      await expect(open(file)).rejects.toThrow(DecryptError);
    });

    it('swapped, dropped or repeated chunks', async () => {
      for (const edit of [
        (c: string[]) => [c[1], c[0], c[2], c[3]],
        (c: string[]) => [c[0], c[1], c[3]],
        (c: string[]) => [c[0], c[1], c[2]],
        (c: string[]) => [c[0], c[1], c[1], c[2], c[3]],
        (c: string[]) => c.slice().reverse(),
      ]) {
        const { file, open } = await sealed();
        file.encrypted.chunks = edit(file.encrypted.chunks);
        await expect(open(file)).rejects.toThrow(DecryptError);
      }
    });

    it('a changed header (the cost, or the chunk size)', async () => {
      for (const edit of [
        (box: Record<string, unknown>) => (box.N = 2 ** 13),
        (box: Record<string, unknown>) => (box.r = 4),
        (box: Record<string, unknown>) => (box.p = 2),
        (box: Record<string, unknown>) => (box.chunk = CHUNK_BYTES * 2),
      ]) {
        const { file, open } = await sealed();
        edit(file.encrypted);
        await expect(open(file)).rejects.toThrow(DecryptError);
      }
    });

    it('a chunk cut short or padded, or not base64', async () => {
      for (const make of [(c: string) => c.slice(0, 20), (c: string) => `${c}AAAA`, () => '!!!!', () => '']) {
        const { file, open } = await sealed();
        file.encrypted.chunks[0] = make(file.encrypted.chunks[0] as string);
        await expect(open(file)).rejects.toThrow(DecryptError);
      }
    });
  });

  describe('reading a file to see what it is', () => {
    it('says null for the plain format, and for things that are not Tally files', () => {
      expect(readEnvelope({ app: 'tally', format: 1, tasks: [], entries: [], settings: [] })).toBeNull();
      for (const other of [
        null,
        5,
        'text',
        [],
        {},
        { app: 'other', format: 2 },
        { app: 'tally' },
        { app: 'tally', format: 0 },
      ]) {
        expect(readEnvelope(other)).toBeNull();
      }
    });

    it('says newer for a format this version doesn’t know', () => {
      expect(() => readEnvelope({ app: 'tally', format: 3 })).toThrow(EnvelopeError);
      try {
        readEnvelope({ app: 'tally', format: 3 });
      } catch (error) {
        expect((error as EnvelopeError).problem).toBe('newer');
      }
    });

    it('rejects a malformed envelope, and one that asks for too much', async () => {
      const key = await createKey('pw-12345678', random, FAST);
      const { sealed } = await envelopeOf(text, key);
      const mutate = (edit: (box: Record<string, unknown>) => void) => {
        const copy = JSON.parse(JSON.stringify(sealed));
        edit(copy.encrypted);
        return copy;
      };
      for (const bad of [
        { app: 'tally', format: 2 },
        { app: 'tally', format: 2, encrypted: 'x' },
        mutate((box) => (box.cipher = 'aes')),
        mutate((box) => (box.kdf = 'pbkdf2')),
        mutate((box) => (box.N = 2 ** 20)),
        mutate((box) => (box.N = 100)),
        mutate((box) => (box.salt = 'AAAA')),
        mutate((box) => (box.salt = 5)),
        mutate((box) => (box.chunk = 10)),
        mutate((box) => (box.chunk = 2 ** 25)),
        mutate((box) => (box.chunks = [])),
        mutate((box) => (box.chunks = 'x')),
        mutate((box) => (box.chunks = [1, 2])),
      ]) {
        expect(() => readEnvelope(bad)).toThrow(EnvelopeError);
      }
    });
  });
});
