'use strict';

// Small secrets (the Dropbox refresh token), encrypted with Windows' DPAPI
// through Electron's safeStorage and kept in a file in the user data folder.

const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');

function file() {
  return path.join(app.getPath('userData'), 'secrets.json');
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    return {};
  }
}

function write(data) {
  const target = file();
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data));
  fs.renameSync(temporary, target);
}

function get(key) {
  const encrypted = read()[key];
  if (typeof encrypted !== 'string') return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    // Written by another Windows user or machine: it can't be read here, so it's as good as gone.
    return null;
  }
}

function set(key, value) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Encryption is not available on this system');
  write({ ...read(), [key]: safeStorage.encryptString(value).toString('base64') });
}

function remove(key) {
  const data = read();
  delete data[key];
  write(data);
}

module.exports = { get, set, remove };
