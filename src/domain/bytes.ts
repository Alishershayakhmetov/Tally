// Bytes, base64 and UTF-8 without relying on what the JS engine has: Hermes lacks
// TextDecoder in some versions, and btoa/atob want binary strings. Used by the
// sync encryption (syncCrypto.ts).

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Int16Array(128).fill(-1);
for (let i = 0; i < BASE64.length; i++) LOOKUP[BASE64.charCodeAt(i)] = i;

/** Standard base64 with padding. */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const CHUNK = 3 * 4096;
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    let out = '';
    for (let i = start; i < end; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
      out += BASE64[n >> 18] + BASE64[(n >> 12) & 63] + BASE64[(n >> 6) & 63] + BASE64[n & 63];
    }
    parts.push(out);
  }
  const text = parts.join('');
  const padding = (3 - (bytes.length % 3)) % 3;
  return padding === 0 ? text : `${text.slice(0, text.length - padding)}${'='.repeat(padding)}`;
}

/** Strict: a character outside the alphabet, a bad length or misplaced padding gives null. */
export function fromBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0) return null;
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const code = text.charCodeAt(i + k);
      const isPad = code === 61;
      if (isPad && i + k < text.length - padding) return null;
      const value = isPad ? 0 : code < 128 ? LOOKUP[code] : -1;
      if (value < 0) return null;
      n = (n << 6) | value;
    }
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** UTF-8 by hand, for engines without TextEncoder (and tested against it). */
export function utf8EncodeByHand(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return Uint8Array.from(out);
}

/**
 * UTF-8 by hand, for engines without TextDecoder: the WHATWG decoder. Each invalid
 * or cut-short sequence becomes one U+FFFD, exactly as TextDecoder does it.
 */
export function utf8DecodeByHand(bytes: Uint8Array): string {
  const parts: string[] = [];
  let units: number[] = [];
  const flush = () => {
    parts.push(String.fromCharCode(...units));
    units = [];
  };
  const emit = (code: number) => {
    if (code >= 0x10000) {
      const v = code - 0x10000;
      units.push(0xd800 + (v >> 10), 0xdc00 + (v & 1023));
    } else units.push(code);
    if (units.length >= 4096) flush();
  };

  let needed = 0;
  let seen = 0;
  let code = 0;
  let lower = 0x80;
  let upper = 0xbf;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (needed === 0) {
      if (b <= 0x7f) emit(b);
      else if (b >= 0xc2 && b <= 0xdf) {
        needed = 1;
        code = b & 0x1f;
      } else if (b >= 0xe0 && b <= 0xef) {
        if (b === 0xe0) lower = 0xa0;
        if (b === 0xed) upper = 0x9f;
        needed = 2;
        code = b & 0x0f;
      } else if (b >= 0xf0 && b <= 0xf4) {
        if (b === 0xf0) lower = 0x90;
        if (b === 0xf4) upper = 0x8f;
        needed = 3;
        code = b & 0x07;
      } else emit(0xfffd);
    } else if (b < lower || b > upper) {
      // The sequence broke off: one replacement for what came before, and this byte starts over.
      needed = seen = code = 0;
      lower = 0x80;
      upper = 0xbf;
      emit(0xfffd);
      i--;
    } else {
      lower = 0x80;
      upper = 0xbf;
      code = (code << 6) | (b & 0x3f);
      if (++seen === needed) {
        emit(code);
        needed = seen = code = 0;
      }
    }
  }
  if (needed !== 0) emit(0xfffd);
  flush();
  return parts.join('');
}

export function utf8Encode(text: string): Uint8Array {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text) : utf8EncodeByHand(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  return typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(bytes) : utf8DecodeByHand(bytes);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
