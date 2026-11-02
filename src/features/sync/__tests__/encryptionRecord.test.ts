import { randomBytes } from 'node:crypto';

import { createKey, sameKey, type KdfParams } from '@/domain/syncCrypto';

import {
  completed,
  encryptionState,
  isPending,
  NO_ENCRYPTION,
  parseRecord,
  policyOf,
  serializeRecord,
  type EncryptionRecord,
} from '../encryptionRecord';

const FAST: KdfParams = { N: 2 ** 12, r: 8, p: 1 };
const random = (n: number) => new Uint8Array(randomBytes(n));

describe('the encryption record', () => {
  it('describes what a sync should do', async () => {
    const a = await createKey('first password', random, FAST);
    const b = await createKey('second password', random, FAST);
    const steady: EncryptionRecord = { current: a, target: a, replace: false };
    expect(policyOf(steady)).toEqual({ read: a, write: a, replace: false });
    expect(policyOf(NO_ENCRYPTION)).toEqual({ read: null, write: null, replace: false });

    expect(isPending(steady)).toBe(false);
    expect(isPending(NO_ENCRYPTION)).toBe(false);
    expect(isPending({ current: null, target: a, replace: false })).toBe(true); // turning on
    expect(isPending({ current: a, target: null, replace: false })).toBe(true); // turning off
    expect(isPending({ current: a, target: b, replace: false })).toBe(true); // changing
    expect(isPending({ current: null, target: null, replace: true })).toBe(true); // starting over

    expect(encryptionState(steady)).toEqual({ on: true, pending: false });
    expect(encryptionState({ current: null, target: a, replace: false })).toEqual({
      on: true,
      pending: true,
    });
    expect(encryptionState({ current: a, target: null, replace: false })).toEqual({
      on: false,
      pending: true,
    });
    expect(encryptionState(NO_ENCRYPTION)).toEqual({ on: false, pending: false });
  });

  it('is done once the cloud file has the target form', async () => {
    const a = await createKey('first password', random, FAST);
    const b = await createKey('second password', random, FAST);
    for (const record of [
      { current: null, target: a, replace: false },
      { current: a, target: b, replace: false },
      { current: a, target: null, replace: false },
      { current: null, target: b, replace: true },
    ] satisfies EncryptionRecord[]) {
      const done = completed(record);
      expect(isPending(done)).toBe(false);
      expect(sameKey(done.current, record.target)).toBe(true);
      expect(sameKey(done.target, record.target)).toBe(true);
      expect(done.replace).toBe(false);
    }
  });

  it('keeps and restores a record, keys included', async () => {
    const a = await createKey('first password', random, FAST);
    const b = await createKey('second password', random, FAST);
    for (const record of [
      NO_ENCRYPTION,
      { current: a, target: a, replace: false },
      { current: a, target: b, replace: false },
      { current: null, target: b, replace: true },
    ] satisfies EncryptionRecord[]) {
      const text = serializeRecord(record);
      const { record: back, damaged } = parseRecord(text);
      expect(damaged).toBe(false);
      expect(sameKey(back.current, record.current)).toBe(true);
      expect(sameKey(back.target, record.target)).toBe(true);
      expect(back.replace).toBe(record.replace);
    }
  });

  it('keeps a key in the stored text only as the derived key, never a password', async () => {
    const key = await createKey('a password nobody should see', random, FAST);
    const text = serializeRecord({ current: key, target: key, replace: false });
    expect(text).not.toContain('a password nobody should see');
    expect(JSON.parse(text).target).toEqual({ salt: key.salt, key: expect.any(String), N: 4096, r: 8, p: 1 });
  });

  it('reads a missing entry as "no encryption", and a damaged one as damaged', async () => {
    expect(parseRecord(null)).toEqual({ record: NO_ENCRYPTION, damaged: false });
    expect(parseRecord('')).toEqual({ record: NO_ENCRYPTION, damaged: false });

    const key = await createKey('first password', random, FAST);
    const good = JSON.parse(serializeRecord({ current: key, target: key, replace: false }));
    const cases = [
      'not json',
      '5',
      'null',
      JSON.stringify({ v: 2, current: null, target: null, replace: false }),
      // One key unreadable: it must not be read as "target: null", which would mean "turn encryption off".
      JSON.stringify({ ...good, target: { ...good.target, key: 'AAAA' } }),
      JSON.stringify({ ...good, current: { ...good.current, salt: 'x' } }),
      JSON.stringify({ ...good, target: { ...good.target, N: 7 } }),
    ];
    for (const text of cases) {
      expect(parseRecord(text)).toEqual({ record: NO_ENCRYPTION, damaged: true });
    }
  });
});
