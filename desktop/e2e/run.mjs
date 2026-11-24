// End-to-end checks of the Windows app: starts Electron (or a packaged Tally.exe)
// with a throwaway data folder, drives its window over the debugging port with
// playwright-core (no browser download: it attaches to Electron), and asserts.
//
//   npm run build:web        # the window shows desktop/web/, so build it first
//   npm run e2e              # from source
//   npm run e2e -- --exe release/win-unpacked/Tally.exe   # the packaged app
//
// Dropbox is faked (e2e/fakeDropbox.mjs): the app's requests to Dropbox's two API
// hosts are sent to a server on this machine that answers as Dropbox's API does.
// That makes it possible to run the whole sync, with two app instances and the
// encryption, without an account. Real Dropbox itself isn't exercised.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import electronPath from 'electron';
import { chromium } from 'playwright-core';

import { startFakeDropbox } from './fakeDropbox.mjs';

const desktop = resolve(import.meta.dirname, '..');
const exeIndex = process.argv.indexOf('--exe');
const exe = exeIndex > 0 ? resolve(process.argv[exeIndex + 1]) : null;

const work = mkdtempSync(join(tmpdir(), 'tally-e2e-'));
const userData = join(work, 'data');
const saved = join(work, 'saved');
const browserLog = join(work, 'browser.log');
mkdirSync(saved);
const fake = await startFakeDropbox();

// TALLY_E2E_SHOTS=<folder> keeps a screenshot at the key steps, to look at.
const shotDir = process.env.TALLY_E2E_SHOTS;
async function shot(page, name) {
  if (!shotDir) return;
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: join(shotDir, `${name}.png`) });
}

// ---------------------------------------------------------------------------
// Starting and stopping the app

function freePort() {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once('error', fail);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

/** `dir`: this instance's data folder; `log`: where it writes the sign-in addresses it would open in a browser. */
async function launch(dir = userData, log = browserLog) {
  const port = await freePort();
  const env = {
    ...process.env,
    TALLY_USER_DATA: dir,
    TALLY_DEBUG_PORT: String(port),
    TALLY_TEST_SAVE_DIR: saved,
    TALLY_TEST_BROWSER_LOG: log,
    TALLY_TEST_DROPBOX_ORIGIN: fake.origin,
  };
  const child = exe
    ? spawn(exe, [], { env, stdio: 'ignore' })
    : spawn(electronPath, [desktop], { env, stdio: 'ignore' });
  let browser = null;
  for (let attempt = 0; attempt < 60 && !browser; attempt++) {
    await new Promise((wait) => setTimeout(wait, 500));
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`).catch(() => null);
  }
  assert.ok(browser, 'the app did not start');
  const context = browser.contexts()[0];
  let page = context.pages().find((p) => p.url().startsWith('app://'));
  for (let attempt = 0; attempt < 20 && !page; attempt++) {
    await new Promise((wait) => setTimeout(wait, 250));
    page = context.pages().find((p) => p.url().startsWith('app://'));
  }
  assert.ok(page, 'the window did not load');
  await page.waitForSelector('text=Settings');
  return {
    page,
    async close() {
      await browser.close().catch(() => {});
      child.kill();
      await new Promise((wait) => setTimeout(wait, 1000));
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers

const visible = (locator) => locator.filter({ visible: true }).first();
const cards = (page) => page.getByRole('button', { name: /^(Water|Push-ups|Reading)/ });
const text = (page) => page.evaluate(() => document.body.innerText);
const order = async (page) =>
  (await text(page)).split('\n').filter((line) => /^(Water|Push-ups|Reading)$/.test(line));
const pause = (page, ms = 600) => page.waitForTimeout(ms);

async function createFromTemplate(page, name) {
  await visible(page.getByText('New task')).click();
  await pause(page, 500);
  await visible(page.getByText(new RegExp(`^${name}`))).click();
  await visible(page.getByText('Create task')).scrollIntoViewIfNeeded();
  await visible(page.getByText('Create task')).click();
  await pause(page, 900);
  await page.goBack();
  await pause(page);
}

/** Press on a card's handle and pull to another card, at the speed of a person's hand. */
async function dragByHandle(page, from, to, stepMs = 0) {
  const start = await cards(page).nth(from).boundingBox();
  const end = await cards(page).nth(to).boundingBox();
  const x = start.x + 12;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  for (let step = 1; step <= 12; step++) {
    await page.mouse.move(x + 2, start.y + start.height / 2 + ((end.y - start.y) * step) / 12);
    if (stepMs) await page.waitForTimeout(stepMs);
  }
  await page.waitForTimeout(250);
  await page.mouse.up();
  await pause(page, 700);
}

// ---------------------------------------------------------------------------
// The checks, in order: later ones rely on the data earlier ones made.

const checks = [];
const check = (name, run) => checks.push({ name, run });

check('starts empty, then makes three tasks from templates', async ({ page }) => {
  assert.match(await text(page), /No tasks yet/);
  for (const name of ['Water', 'Push-ups', 'Reading']) await createFromTemplate(page, name);
  assert.deepEqual(await order(page), ['Water', 'Push-ups', 'Reading']);
});

check('counts, and the data survives a restart', async (context) => {
  const { page } = context;
  await cards(page).nth(0).click();
  await pause(page, 800);
  const add = page.getByLabel('Add 1', { exact: true }).filter({ visible: true }).first();
  await add.click();
  await add.click();
  await pause(page, 700);
  assert.match(await text(page), /\n2\nof 8/);
  await page.goBack();
  await pause(page);
  await context.restart();
  assert.match(await text(context.page), /2 \/ 8/);
});

check('drags a card by its handle, even when the pull starts at once', async ({ page }) => {
  await pause(page, 500);
  const before = await order(page);
  await dragByHandle(page, 2, 0, 0);
  const afterFast = await order(page);
  assert.deepEqual(afterFast, [before[2], before[0], before[1]]);
  await dragByHandle(page, 2, 0, 15);
  assert.deepEqual(await order(page), [afterFast[2], afterFast[0], afterFast[1]]);
  await dragByHandle(page, 0, 2, 15);
  assert.deepEqual(await order(page), afterFast);
});

check('the card body does not start a drag, and a click opens the task', async ({ page }) => {
  const before = await order(page);
  const box = await cards(page).nth(0).boundingBox();
  await page.mouse.move(box.x + 200, box.y + 40);
  await page.mouse.down();
  await pause(page, 500);
  await page.mouse.move(box.x + 200, box.y + 260, { steps: 10 });
  await page.mouse.up();
  await pause(page, 500);
  assert.deepEqual(await order(page), before);
  await cards(page).nth(0).click();
  await pause(page, 700);
  assert.match((await text(page)).split('\n')[0], new RegExp(`^${before[0]}`));
  await page.goBack();
  await pause(page);
});

check('the keyboard moves a card (Alt+arrows) and Enter opens it once', async ({ page }) => {
  const before = await order(page);
  await cards(page).nth(1).focus();
  await page.keyboard.press('Alt+ArrowUp');
  await pause(page, 700);
  assert.deepEqual(await order(page), [before[1], before[0], before[2]]);
  await page.keyboard.press('Alt+ArrowDown');
  await pause(page, 700);
  assert.deepEqual(await order(page), before);
  await page.keyboard.press('Enter');
  await pause(page, 800);
  assert.notEqual(page.url(), 'app://tally/', 'Enter did not open the task');
  await page.goBack();
  await pause(page);
  // One step back must be Home: had Enter opened the task twice, this would still be a task.
  assert.equal(page.url(), 'app://tally/', 'Enter opened the task twice');
});

check('the template row scrolls with the mouse wheel', async ({ page }) => {
  await visible(page.getByText('New task')).click();
  await pause(page, 700);
  const picker = visible(page.getByTestId('template-picker'));
  const box = await picker.boundingBox();
  await page.mouse.move(box.x + 200, box.y + 60);
  await page.mouse.wheel(0, 400);
  await pause(page, 500);
  assert.ok((await picker.evaluate((node) => node.scrollLeft)) > 100, 'the row did not scroll');
  await page.mouse.wheel(0, 3000);
  await pause(page, 300);
  assert.ok(await picker.evaluate((node) => node.scrollLeft >= node.scrollWidth - node.clientWidth - 1));
  await visible(page.getByText(/^Meditation/)).click();
  await pause(page, 400);
  const values = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((input) => input.value),
  );
  assert.ok(values.includes('Meditation'));
  await page.goBack();
  await pause(page);
});

check('the emoji category tabs scroll with the wheel too', async ({ page }) => {
  await visible(page.getByText('New task')).click();
  await pause(page, 600);
  await visible(page.getByRole('button', { name: /More icons/ })).scrollIntoViewIfNeeded();
  await visible(page.getByRole('button', { name: /More icons/ })).click();
  await pause(page, 700);
  const tabs = visible(page.getByRole('tablist'));
  const box = await tabs.boundingBox();
  await page.mouse.move(box.x + 150, box.y + 20);
  await page.mouse.wheel(0, 300);
  await pause(page, 400);
  assert.ok((await tabs.evaluate((node) => node.scrollLeft)) > 50);
  await visible(page.getByText('Cancel', { exact: true })).click();
  await page.goBack();
  await pause(page);
});

check('a task page is centred and its header button keeps a margin', async ({ page }) => {
  await cards(page).nth(0).click();
  await pause(page, 800);
  const { windowCenter, contentCenter } = await page.evaluate(() => {
    const onScreen = (element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.right > 0 && box.left < innerWidth;
    };
    const total = [...document.querySelectorAll('div')].find(
      (element) =>
        element.children.length === 0 &&
        /^\d+$/.test(element.textContent ?? '') &&
        onScreen(element) &&
        parseFloat(getComputedStyle(element).fontSize) > 40,
    );
    const box = total.getBoundingClientRect();
    return { windowCenter: innerWidth / 2, contentCenter: box.x + box.width / 2 };
  });
  assert.ok(Math.abs(windowCenter - contentCenter) < 1.5, `off centre: ${windowCenter} vs ${contentCenter}`);
  const edit = await visible(page.getByRole('button', { name: 'Edit', exact: true })).boundingBox();
  const width = await page.evaluate(() => innerWidth);
  assert.ok(
    width - (edit.x + edit.width) >= 12,
    `the Edit button touches the window's edge (${width - edit.x - edit.width}px)`,
  );
  await page.goBack();
  await pause(page);
});

check(
  'a description opens in a sheet that closes before Edit task, and the form stays usable',
  async ({ page }) => {
    const long = Array(12).fill('Why: strength.').join(' ') + '\n\nHow: every morning.';
    await cards(page).nth(0).click();
    await pause(page, 800);
    await visible(page.getByRole('button', { name: 'Edit', exact: true })).click();
    await pause(page, 600);
    await visible(page.getByLabel('Description', { exact: true })).fill(long);
    await visible(page.getByText('Save changes', { exact: true })).click();
    await pause(page, 800);
    await visible(page.getByText(/Show all/)).click();
    await pause(page, 800);
    await visible(page.getByText('Edit task', { exact: true })).click();
    await pause(page, 900);
    assert.equal(
      await page.getByText('Close', { exact: true }).filter({ visible: true }).count(),
      0,
      'the sheet is still open',
    );
    const field = visible(page.getByLabel('Description', { exact: true }));
    assert.equal(await field.inputValue(), long);
    await field.fill('');
    assert.equal(await field.inputValue(), '', 'the form takes no input: a sheet is still covering it');
    await visible(page.getByText('Save changes', { exact: true })).click();
    await pause(page, 800);
    await page.goBack();
    await pause(page);
  },
);

check('exports a backup with the local time and offset, and imports it again', async ({ page }) => {
  await visible(page.getByText('Settings')).click();
  await pause(page, 500);
  await page.getByRole('button', { name: 'Export' }).click();
  await pause(page, 1200);
  const files = readdirSync(saved);
  assert.equal(files.length, 1);
  const backup = JSON.parse(readFileSync(join(saved, files[0]), 'utf8'));
  const offsetMin = -new Date().getTimezoneOffset();
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  assert.ok(backup.exportedAt.endsWith(offset), `${backup.exportedAt} should end with ${offset}`);
  assert.ok(Math.abs(Date.parse(backup.exportedAt) - Date.now()) < 5 * 60_000);
  assert.equal(backup.tasks.length, 3);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Import' }).click();
  await (await chooser).setFiles(join(saved, files[0]));
  await pause(page, 1200);
  assert.match(await text(page), /Nothing new/);
});

check(
  'Dropbox sign-in: the redirect is checked, a made-up code is refused by Dropbox, Cancel stops it',
  async ({ page }) => {
    const connect = () => page.getByRole('button', { name: 'Connect Dropbox' });
    const lastUrl = () => readFileSync(browserLog, 'utf8').trim().split('\n').pop();
    const redirect = (query) => fetch(`http://localhost:53682/dropbox-auth?${query}`);

    await connect().click();
    await pause(page, 1000);
    const authorize = new URL(lastUrl());
    assert.equal(authorize.origin + authorize.pathname, 'https://www.dropbox.com/oauth2/authorize');
    assert.equal(authorize.searchParams.get('redirect_uri'), 'http://localhost:53682/dropbox-auth');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorize.searchParams.get('token_access_type'), 'offline');
    assert.equal((await redirect('code=fake&state=WRONG')).status, 200);
    await pause(page, 1500);
    assert.match(await text(page), /Couldn’t connect Dropbox/);

    await connect().click();
    await pause(page, 800);
    const state = new URL(lastUrl()).searchParams.get('state');
    await redirect(`code=madeup&state=${encodeURIComponent(state)}`);
    await pause(page, 3500);
    const after = await text(page);
    if (/No connection to Dropbox/.test(after))
      console.log('    (offline: the exchange with Dropbox was skipped)');
    else assert.match(after, /Dropbox no longer lets Tally in/);

    await connect().click();
    await pause(page, 600);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await pause(page, 800);
    assert.equal(await connect().count(), 1);
    assert.equal(
      await redirect('code=x&state=y').then(
        (r) => r.status,
        () => 'closed',
      ),
      'closed',
    );
  },
);

// ---------------------------------------------------------------------------
// Sync between two app instances through the fake Dropbox, with encryption.

const devices = {};
const PASSWORD = 'correct horse battery';

async function until(page, pattern, timeout = 20_000) {
  await page.waitForFunction((source) => new RegExp(source).test(document.body.innerText), pattern.source, {
    timeout,
  });
}

/** Waits until nothing is syncing or waiting for the browser. */
async function idle(page) {
  await pause(page, 400);
  await page.waitForFunction(() => !/Syncing…|Waiting for Dropbox/.test(document.body.innerText), null, {
    timeout: 30_000,
  });
  await pause(page, 300);
}

async function newDevice(name) {
  const log = join(work, `${name}.log`);
  const app = await launch(join(work, name), log);
  devices[name] = { name, page: app.page, log, close: app.close };
  return devices[name];
}

async function toHome(page) {
  for (let step = 0; step < 6 && page.url() !== 'app://tally/'; step++) {
    await page.goBack();
    await pause(page, 500);
  }
  assert.equal(page.url(), 'app://tally/');
}

async function toSettings(page) {
  await toHome(page);
  await visible(page.getByText('Settings')).click();
  await pause(page, 500);
}

async function connectToDropbox({ page, log }) {
  await toSettings(page);
  await page.getByRole('button', { name: 'Connect Dropbox' }).click();
  await pause(page, 1000);
  const state = new URL(readFileSync(log, 'utf8').trim().split('\n').pop()).searchParams.get('state');
  const redirect = await fetch(
    `http://localhost:53682/dropbox-auth?code=ok-${Date.now()}&state=${encodeURIComponent(state)}`,
  );
  assert.equal(redirect.status, 200);
  await until(page, /Connected: Test User/);
  await idle(page);
}

/** "Sync now", and wait for it to finish. */
async function syncNow(page) {
  const before = fake.state.log.length;
  await page.getByRole('button', { name: 'Sync now' }).click();
  for (let wait = 0; wait < 60 && fake.state.log.length === before; wait++) await pause(page, 100);
  await idle(page);
}

const encryptionButton = (page) => page.getByRole('button', { name: /^(Encryption…|Enter password…)$/ });
const submit = (page) => page.getByTestId('encryption-submit');

async function openEncryption(page) {
  await encryptionButton(page).click();
  await submit(page).waitFor();
  await pause(page, 600);
}

async function fillPasswords(page, password, repeat = password) {
  await page.getByTestId('encryption-password').fill(password);
  const again = page.getByTestId('encryption-repeat');
  if (await again.count()) await again.fill(repeat);
}

/** Submits the dialog and waits for it to close and the sync it started to finish. */
async function confirmEncryption(page) {
  await submit(page).click();
  await submit(page).waitFor({ state: 'detached', timeout: 30_000 });
  await idle(page);
}

const cloudText = () => fake.state.file?.text ?? '';
const cloudJson = () => JSON.parse(cloudText());
const salt = () => cloudJson().encrypted.salt;
const sealedNow = () => cloudJson().format === 2;
const occurrences = (haystack, pattern) => (haystack.match(pattern) ?? []).length;

check('sync (fake Dropbox): a first device connects and uploads a plain file', async () => {
  const a = await newDevice('A');
  for (const name of ['Water', 'Reading']) await createFromTemplate(a.page, name);
  await connectToDropbox(a);
  const file = cloudJson();
  assert.equal(file.format, 1);
  assert.deepEqual(file.tasks.map((task) => task.name).sort(), ['Reading', 'Water']);
  assert.match(await text(a.page), /Encryption: off/);
});

check(
  'encryption on: the dialog explains it, checks the password, and the file becomes unreadable',
  async () => {
    const { page } = devices.A;
    await openEncryption(page);
    const explained = await text(page);
    assert.match(explained, /Tally keeps your data in one file/);
    assert.match(explained, /not encrypted now/);
    assert.match(explained, /version history/);
    assert.match(explained, /cannot be recovered/);
    assert.match(explained, /Export are not encrypted/);
    await shot(page, 'enc1_set');

    await fillPasswords(page, 'short');
    await submit(page).click();
    await pause(page, 400);
    // The hint and the error both say it.
    assert.equal(occurrences(await text(page), /At least 8 characters\./g), 2);
    await fillPasswords(page, PASSWORD, 'something else');
    await submit(page).click();
    await pause(page, 400);
    assert.match(await text(page), /The two passwords differ/);
    await shot(page, 'enc2_error');

    await fillPasswords(page, PASSWORD);
    await confirmEncryption(page);
    assert.match(await text(page), /Encryption: on/);
    await shot(page, 'enc3_settings_on');
    assert.equal(sealedNow(), true);
    for (const secret of ['Water', 'Reading', 'tasks', 'entries']) {
      assert.ok(!cloudText().includes(secret), `"${secret}" is readable in Dropbox`);
    }
    // Dropbox's own version history still holds the plain file, as the dialog warned.
    assert.ok(fake.state.history[0].text.includes('Water'));
  },
);

check('a second device is asked for the password: a wrong one is refused, the right one syncs', async () => {
  const b = await newDevice('B');
  await connectToDropbox(b);
  assert.match(await text(b.page), /The data in Dropbox is encrypted\. Enter its password/);
  await toHome(b.page);
  assert.match(await text(b.page), /No tasks yet/);

  await toSettings(b.page);
  await openEncryption(b.page);
  assert.match(await text(b.page), /Enter the sync password/);
  await shot(b.page, 'enc4_enter');
  await fillPasswords(b.page, 'not the password');
  await submit(b.page).click();
  await until(b.page, /doesn.t open the file/);
  await fillPasswords(b.page, PASSWORD);
  await confirmEncryption(b.page);
  assert.match(await text(b.page), /Encryption: on/);
  assert.doesNotMatch(await text(b.page), /Enter its password/);
  await toHome(b.page);
  await until(b.page, /Water/);
  assert.deepEqual(await order(b.page), ['Water', 'Reading']);
});

check('changes on either device reach the other through the sealed file, with the same salt', async () => {
  const { A, B } = devices;
  const before = salt();
  await createFromTemplate(B.page, 'Push-ups');
  await toSettings(B.page);
  await syncNow(B.page);
  assert.equal(salt(), before);
  assert.ok(!cloudText().includes('Push-ups'));
  await toSettings(A.page);
  await syncNow(A.page);
  await toHome(A.page);
  assert.ok((await order(A.page)).includes('Push-ups'));
});

check('changing the password: the other device is asked for the new one', async () => {
  const { A, B } = devices;
  const before = salt();
  await toSettings(A.page);
  await openEncryption(A.page);
  assert.match(await text(A.page), /Encryption is on/);
  assert.match(await text(A.page), /type a new one twice/);
  await shot(A.page, 'enc5_on');
  await fillPasswords(A.page, 'second password!');
  await confirmEncryption(A.page);
  assert.notEqual(salt(), before);

  await toSettings(B.page);
  await syncNow(B.page);
  assert.match(await text(B.page), /The password was changed on another device/);
  await shot(B.page, 'enc6_changed');
  await openEncryption(B.page);
  await fillPasswords(B.page, 'second password!');
  await confirmEncryption(B.page);
  assert.doesNotMatch(await text(B.page), /changed on another device/);
});

check(
  'turning encryption off writes a plain file, and a device that expects encryption is told',
  async () => {
    const { A, B } = devices;
    await toSettings(A.page);
    await openEncryption(A.page);
    assert.match(await submit(A.page).innerText(), /Turn off encryption/);
    await confirmEncryption(A.page);
    assert.match(await text(A.page), /Encryption: off/);
    assert.equal(cloudJson().format, 1);
    assert.ok(cloudText().includes('Water'));

    await toSettings(B.page);
    await syncNow(B.page);
    assert.match(await text(B.page), /not encrypted, but this device expects it to be/);
    await shot(B.page, 'enc7_not_encrypted');
    await B.page.getByRole('button', { name: 'Stop encrypting here' }).click();
    await idle(B.page);
    assert.match(await text(B.page), /Encryption: off/);
    assert.doesNotMatch(await text(B.page), /expects it to be/);
  },
);

check('starting over: the password is lost, one device replaces the file, the other is asked', async () => {
  const { A, B } = devices;
  await toSettings(A.page);
  await openEncryption(A.page);
  await fillPasswords(A.page, 'a password I will lose');
  await confirmEncryption(A.page);
  const lost = salt();

  await toSettings(B.page);
  await syncNow(B.page);
  assert.match(await text(B.page), /The data in Dropbox is encrypted\. Enter its password/);
  await openEncryption(B.page);
  await B.page.getByRole('button', { name: 'I forgot the password' }).click();
  await pause(B.page, 400);
  assert.match(await text(B.page), /Start over in Dropbox/);
  assert.match(await text(B.page), /Nothing is deleted on your devices/);
  await shot(B.page, 'enc8_reset');
  await fillPasswords(B.page, 'brand new password');
  await confirmEncryption(B.page);
  assert.equal(sealedNow(), true);
  assert.notEqual(salt(), lost);
  assert.doesNotMatch(await text(B.page), /Enter its password/);

  await toSettings(A.page);
  await syncNow(A.page);
  assert.match(await text(A.page), /changed on another device/);
});

check('disconnecting forgets the password; connecting again asks for it', async () => {
  const { B } = devices;
  await toSettings(B.page);
  B.page.once('dialog', (dialog) => dialog.accept());
  await B.page.getByRole('button', { name: 'Disconnect' }).click();
  await B.page.getByRole('button', { name: 'Connect Dropbox' }).waitFor();
  assert.doesNotMatch(await text(B.page), /Encryption:/);
  await connectToDropbox(B);
  assert.match(await text(B.page), /The data in Dropbox is encrypted\. Enter its password/);
});

check('only Dropbox can be reached through the bridge, and secrets round-trip', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const bridge = globalThis.tallyDesktop;
    bridge.secrets.set('probe', 'sekret-значение');
    const got = bridge.secrets.get('probe');
    bridge.secrets.delete('probe');
    let blocked = '';
    try {
      await bridge.http({ url: 'https://example.com/' });
    } catch (error) {
      blocked = error.message;
    }
    return { got, gone: bridge.secrets.get('probe'), blocked };
  });
  assert.equal(result.got, 'sekret-значение');
  assert.equal(result.gone, null);
  assert.match(result.blocked, /Blocked request to example\.com/);
});

// ---------------------------------------------------------------------------

const context = {
  page: null,
  closer: null,
  async restart() {
    await this.closer();
    Object.assign(this, await start());
  },
};

async function start() {
  const app = await launch();
  return { page: app.page, closer: app.close };
}

let failed = 0;
try {
  Object.assign(context, await start());
  for (const { name, run } of checks) {
    try {
      await run(context);
      console.log(`  ok    ${name}`);
    } catch (error) {
      failed++;
      console.log(`  FAIL  ${name}\n        ${String(error.message ?? error).split('\n')[0]}`);
    }
  }
} finally {
  for (const device of Object.values(devices)) await device.close();
  await context.closer?.();
  await fake.close();
  if (existsSync(work)) rmSync(work, { recursive: true, force: true });
}
console.log(failed ? `\n${failed} of ${checks.length} failed` : `\nall ${checks.length} passed`);
process.exit(failed ? 1 : 0);
