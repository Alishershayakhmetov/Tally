import { randomBytes } from 'node:crypto';

import { serializeSyncFile } from '@/domain/sync';
import {
  createKey,
  decryptEnvelope,
  encryptToEnvelope,
  keyForHeader,
  readEnvelope,
  type KdfParams,
  type SyncKey,
} from '@/domain/syncCrypto';

import { PLAIN_POLICY, SyncError, syncOnce, type SyncPolicy } from '../engine';
import { Device, FakeDropbox, backup, entry, ids, task } from '../__fakes__/fakes';

const FAST: KdfParams = { N: 2 ** 12, r: 8, p: 1 };
const random = (n: number) => new Uint8Array(randomBytes(n));
const newKey = (password = 'correct-horse-battery') => createKey(password, random, FAST);

const sealed = (key: SyncKey): SyncPolicy => ({ read: key, write: key, replace: false });
const sync = (cloud: FakeDropbox, device: Device, policy: SyncPolicy) =>
  syncOnce(cloud, device, policy, random);

/** What a stranger with access to the Dropbox sees. */
const cloudText = (cloud: FakeDropbox) => cloud.file?.text ?? '';
const isEnvelope = (cloud: FakeDropbox) => readEnvelope(JSON.parse(cloudText(cloud))) !== null;
const phoneData = () =>
  backup({ tasks: [task('Secret goal', 10)], entries: [entry('e1', 'Secret goal', 5, 10)] });

async function failsWith(promise: Promise<unknown>, reason: string) {
  await expect(promise).rejects.toEqual(new SyncError(reason as never));
}

describe('syncing with encryption', () => {
  it('uploads an envelope that shows nothing, and another device with the password reads it', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    const phone = new Device(phoneData());
    await expect(sync(cloud, phone, sealed(key))).resolves.toMatchObject({ pushed: true });
    expect(isEnvelope(cloud)).toBe(true);
    expect(cloudText(cloud)).not.toContain('Secret goal');
    expect(cloudText(cloud)).not.toContain('tasks');

    // The second device knows only the password: its key comes from the file's header.
    const header = readEnvelope(JSON.parse(cloudText(cloud)))!.header;
    const tablet = new Device(backup({}));
    const tabletKey = await keyForHeader('correct-horse-battery', header);
    await sync(cloud, tablet, sealed(tabletKey));
    expect(ids(tablet)).toEqual(ids(phone));
  });

  it('merges both ways through the encrypted file, with the same salt every time', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    const phone = new Device(phoneData());
    const tablet = new Device(backup({ tasks: [task('b', 20)] }));
    await sync(cloud, phone, sealed(key));
    const salt = readEnvelope(JSON.parse(cloudText(cloud)))!.header.salt;
    await sync(cloud, tablet, sealed(key));
    phone.merge(backup({ entries: [entry('e2', 'Secret goal', 7, 30)] }));
    await sync(cloud, phone, sealed(key));
    await sync(cloud, tablet, sealed(key));
    expect(ids(phone)).toEqual(ids(tablet));
    expect(ids(phone).entries).toEqual(['e1:5', 'e2:7']);
    expect(readEnvelope(JSON.parse(cloudText(cloud)))!.header.salt).toBe(salt);
  });

  it('does not upload again when nothing changed', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    const phone = new Device(phoneData());
    await sync(cloud, phone, sealed(key));
    await expect(sync(cloud, phone, sealed(key))).resolves.toMatchObject({ pushed: false });
    expect(cloud.uploads).toBe(1);
  });

  it('handles an upload that races with another device', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    const phone = new Device(phoneData());
    await sync(cloud, phone, sealed(key));
    phone.merge(backup({ entries: [entry('e2', 'Secret goal', 1, 20)] }));
    const tablet = new Device(
      backup({ tasks: [task('Secret goal', 10)], entries: [entry('e3', 'Secret goal', 2, 21)] }),
    );
    // The tablet's upload lands between the phone's download and upload.
    const tabletText = await encryptToEnvelope(serializeSyncFile(tablet.read()), key, random);
    cloud.beforeUpload = () => {
      cloud.beforeUpload = null;
      cloud.file = { text: tabletText, rev: 'tablet' };
    };
    await expect(sync(cloud, phone, sealed(key))).resolves.toMatchObject({ pushed: true });
    expect(cloud.conflicts).toBe(1);
    const other = new Device(backup({}));
    await sync(cloud, other, sealed(key));
    expect(ids(other).entries).toEqual(['e1:5', 'e2:1', 'e3:2']);
  });
});

describe('turning encryption on, off and changing the password', () => {
  it('turning it on re-seals a plain cloud file, even when nothing else changed', async () => {
    const cloud = new FakeDropbox();
    const phone = new Device(phoneData());
    await sync(cloud, phone, PLAIN_POLICY);
    expect(isEnvelope(cloud)).toBe(false);
    expect(cloudText(cloud)).toContain('Secret goal');

    const key = await newKey();
    // read: null — the cloud file is expected to be plain; write: the new key.
    await expect(sync(cloud, phone, { read: null, write: key, replace: false })).resolves.toMatchObject({
      pushed: true,
    });
    expect(isEnvelope(cloud)).toBe(true);
    expect(cloudText(cloud)).not.toContain('Secret goal');
    // And once recorded, it's steady.
    await expect(sync(cloud, phone, sealed(key))).resolves.toMatchObject({ pushed: false });
  });

  it('turning it on merges what the plain file held, so nothing is lost', async () => {
    const cloud = new FakeDropbox();
    const tablet = new Device(backup({ tasks: [task('from tablet', 5)] }));
    await sync(cloud, tablet, PLAIN_POLICY);
    const phone = new Device(phoneData());
    const key = await newKey();
    await sync(cloud, phone, { read: null, write: key, replace: false });
    expect(ids(phone).tasks).toEqual(['Secret goal@10', 'from tablet@5']);
    const header = readEnvelope(JSON.parse(cloudText(cloud)))!.header;
    const text = await decryptEnvelope(readEnvelope(JSON.parse(cloudText(cloud)))!, key);
    expect(JSON.parse(text).tasks).toHaveLength(2);
    expect(header.kdf).toEqual(FAST);
  });

  it('an interrupted turn-on (uploaded, but not yet recorded) is picked up again', async () => {
    const cloud = new FakeDropbox();
    const phone = new Device(phoneData());
    await sync(cloud, phone, PLAIN_POLICY);
    const key = await newKey();
    await sync(cloud, phone, { read: null, write: key, replace: false });
    // The app was closed before it noted the change: the same policy runs again.
    await expect(sync(cloud, phone, { read: null, write: key, replace: false })).resolves.toMatchObject({
      pushed: false,
    });
  });

  it('changing the password re-seals the file; the old password then no longer fits', async () => {
    const cloud = new FakeDropbox();
    const oldKey = await newKey('first password');
    const newer = await newKey('second password');
    const phone = new Device(phoneData());
    const tablet = new Device(backup({}));
    await sync(cloud, phone, sealed(oldKey));
    await sync(cloud, tablet, sealed(oldKey));

    await expect(sync(cloud, phone, { read: oldKey, write: newer, replace: false })).resolves.toMatchObject({
      pushed: true,
    });
    expect(readEnvelope(JSON.parse(cloudText(cloud)))!.header.salt).toBe(newer.salt);
    // The tablet still has the old password.
    await failsWith(sync(cloud, tablet, sealed(oldKey)), 'passwordChanged');
    // Entering the new one on the tablet restores syncing.
    const header = readEnvelope(JSON.parse(cloudText(cloud)))!.header;
    const tabletKey = await keyForHeader('second password', header);
    await expect(sync(cloud, tablet, sealed(tabletKey))).resolves.toBeDefined();
    // And a repeat of the phone's step (recorded late) is accepted, not an error.
    await expect(sync(cloud, phone, { read: oldKey, write: newer, replace: false })).resolves.toMatchObject({
      pushed: false,
    });
  });

  it('turning encryption off writes a plain file, merging what the encrypted one held', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    const phone = new Device(phoneData());
    const tablet = new Device(backup({ tasks: [task('from tablet', 5)] }));
    await sync(cloud, tablet, sealed(key));
    await expect(sync(cloud, phone, { read: key, write: null, replace: false })).resolves.toMatchObject({
      pushed: true,
    });
    expect(isEnvelope(cloud)).toBe(false);
    expect(JSON.parse(cloudText(cloud)).tasks).toHaveLength(2);
    expect(ids(phone).tasks).toContain('from tablet@5');
    // A repeat after a crash is fine too, and plain syncing carries on.
    await expect(sync(cloud, phone, { read: key, write: null, replace: false })).resolves.toMatchObject({
      pushed: false,
    });
    await expect(sync(cloud, phone, PLAIN_POLICY)).resolves.toMatchObject({ pushed: false });
  });
});

describe('a device that doesn’t match the file', () => {
  it('has no password for an encrypted file: it stops, and touches nothing', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    await sync(cloud, new Device(phoneData()), sealed(key));
    const before = cloud.file;
    const laptop = new Device(backup({ tasks: [task('laptop only', 3)] }));
    await failsWith(sync(cloud, laptop, PLAIN_POLICY), 'passwordRequired');
    expect(cloud.file).toBe(before);
    expect(cloud.uploads).toBe(1);
    expect(ids(laptop).tasks).toEqual(['laptop only@3']);
  });

  it('turning encryption on over a file that is encrypted with an unknown password stops, too', async () => {
    const cloud = new FakeDropbox();
    await sync(cloud, new Device(phoneData()), sealed(await newKey('someone elses')));
    const mine = await newKey('mine');
    await failsWith(
      sync(cloud, new Device(backup({})), { read: null, write: mine, replace: false }),
      'passwordRequired',
    );
    expect(cloud.uploads).toBe(1);
  });

  it('expects encryption but finds a plain file: it does not merge it, and does not overwrite it', async () => {
    const cloud = new FakeDropbox();
    await sync(cloud, new Device(backup({ tasks: [task('planted', 99)] })), PLAIN_POLICY);
    const before = cloud.file;
    const key = await newKey();
    const phone = new Device(phoneData());
    await failsWith(sync(cloud, phone, sealed(key)), 'cloudNotEncrypted');
    expect(cloud.file).toBe(before);
    expect(ids(phone).tasks).toEqual(['Secret goal@10']);
  });

  it('can choose to encrypt that file again, with the key it already has', async () => {
    const cloud = new FakeDropbox();
    await sync(cloud, new Device(backup({ tasks: [task('plain data', 4)] })), PLAIN_POLICY);
    const key = await newKey();
    const phone = new Device(phoneData());
    await sync(cloud, phone, { read: null, write: key, replace: false });
    expect(isEnvelope(cloud)).toBe(true);
    expect(ids(phone).tasks).toEqual(['Secret goal@10', 'plain data@4']);
  });

  it('refuses a damaged or tampered file whose salt it recognises, and never overwrites it', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    await sync(cloud, new Device(phoneData()), sealed(key));
    const file = JSON.parse(cloudText(cloud));
    const chunk = file.encrypted.chunks[0] as string;
    file.encrypted.chunks[0] = `${chunk.slice(0, 50)}${chunk[50] === 'A' ? 'B' : 'A'}${chunk.slice(51)}`;
    cloud.file = { text: JSON.stringify(file), rev: 'bad' };
    const tampered = cloud.file;
    await failsWith(sync(cloud, new Device(backup({})), sealed(key)), 'fileInvalid');
    expect(cloud.file).toBe(tampered);
    expect(cloud.uploads).toBe(1);
  });

  it('reads a newer format as "newer", and a broken envelope as damaged', async () => {
    const cloud = new FakeDropbox();
    const key = await newKey();
    cloud.file = { text: JSON.stringify({ app: 'tally', format: 3, whatever: true }), rev: 'r1' };
    await failsWith(sync(cloud, new Device(backup({})), sealed(key)), 'newerFormat');
    cloud.file = {
      text: JSON.stringify({ app: 'tally', format: 2, encrypted: { cipher: 'rot13' } }),
      rev: 'r2',
    };
    await failsWith(sync(cloud, new Device(backup({})), sealed(key)), 'fileInvalid');
    cloud.file = { text: 'not json', rev: 'r3' };
    await failsWith(sync(cloud, new Device(backup({})), PLAIN_POLICY), 'fileInvalid');
    expect(cloud.uploads).toBe(0);
  });
});

describe('starting over', () => {
  it('replaces a file nobody can open with this device’s data, under a new password', async () => {
    const cloud = new FakeDropbox();
    await sync(cloud, new Device(backup({ tasks: [task('lost', 1)] })), sealed(await newKey('forgotten')));
    const lostRev = cloud.file!.rev;
    const key = await newKey('a new one');
    const phone = new Device(phoneData());
    await expect(sync(cloud, phone, { read: null, write: key, replace: true })).resolves.toMatchObject({
      pushed: true,
    });
    expect(cloud.file!.rev).not.toBe(lostRev);
    // Nothing from the lost file came in; the file now opens with the new password.
    expect(ids(phone).tasks).toEqual(['Secret goal@10']);
    const text = await decryptEnvelope(readEnvelope(JSON.parse(cloudText(cloud)))!, key);
    expect(JSON.parse(text).tasks.map((t: { id: string }) => t.id)).toEqual(['Secret goal']);
  });

  it('can replace it with a plain file, and replaces an unreadable one', async () => {
    const cloud = new FakeDropbox();
    cloud.file = { text: '\u0000garbage', rev: 'r0' };
    const phone = new Device(phoneData());
    await expect(sync(cloud, phone, { read: null, write: null, replace: true })).resolves.toMatchObject({
      pushed: true,
    });
    expect(isEnvelope(cloud)).toBe(false);
    expect(JSON.parse(cloudText(cloud)).tasks).toHaveLength(1);
  });

  it('creates the file when there is none', async () => {
    const cloud = new FakeDropbox();
    await expect(
      sync(cloud, new Device(phoneData()), { read: null, write: await newKey(), replace: true }),
    ).resolves.toMatchObject({ pushed: true });
    expect(isEnvelope(cloud)).toBe(true);
  });
});

describe('what the engine requires', () => {
  it('needs a random source to encrypt, and says so before touching the cloud', async () => {
    const cloud = new FakeDropbox();
    await expect(syncOnce(cloud, new Device(phoneData()), sealed(await newKey()))).rejects.toThrow('random');
    expect(cloud.uploads).toBe(0);
  });

  it('plain syncing needs no random source and is unchanged', async () => {
    const cloud = new FakeDropbox();
    await expect(syncOnce(cloud, new Device(phoneData()))).resolves.toMatchObject({ pushed: true });
    expect(JSON.parse(cloudText(cloud)).format).toBe(1);
  });
});
