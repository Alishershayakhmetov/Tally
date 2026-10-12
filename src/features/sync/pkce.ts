import * as Crypto from 'expo-crypto';

// PKCE (RFC 7636): the app makes a random verifier, sends its SHA-256 (the
// challenge) with the sign-in, and the verifier itself with the code exchange.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Base64url without padding. */
export function base64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [n >> 18, (n >> 12) & 63, (n >> 6) & 63, n & 63].map((k) => ALPHABET[k]);
    out += chars.slice(0, Math.min(4, bytes.length - i + 1)).join('');
  }
  return out;
}

/** 43 characters from 32 random bytes, the shortest verifier the RFC allows. */
export function createVerifier(): string {
  return base64Url(Crypto.getRandomBytes(32));
}

/** Ties the redirect to the sign-in this app started. */
export function createState(): string {
  return base64Url(Crypto.getRandomBytes(16));
}

export async function challengeFor(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
