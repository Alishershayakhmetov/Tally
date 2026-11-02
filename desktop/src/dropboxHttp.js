'use strict';

// Requests to Dropbox are made here, not in the page: the page would need
// Dropbox's CORS headers, and this way it can only reach Dropbox's two API hosts.

const { net } = require('electron');

const ALLOWED_HOSTS = new Set(['api.dropboxapi.com', 'content.dropboxapi.com']);

async function request({ url, method = 'GET', headers = {}, body }) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    throw new Error(`Blocked request to ${target.hostname}`);
  }
  // Tests only: a fake Dropbox on this machine answers instead (e2e/fakeDropbox.mjs).
  const testOrigin = process.env.TALLY_TEST_DROPBOX_ORIGIN;
  const href = testOrigin ? new URL(target.pathname + target.search, testOrigin).href : target.href;
  const response = await net.fetch(href, { method, headers, body });
  return { status: response.status, headers: [...response.headers.entries()], body: await response.text() };
}

module.exports = { request };
