import crypto from 'node:crypto';

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function generateCodeVerifier() {
  // 43 to 128 chars recommended
  const bytes = crypto.randomBytes(64);
  return base64Url(bytes);
}

export function codeChallengeS256(verifier) {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64Url(hash);
}

export function randomId(prefix = '') {
  return prefix + base64Url(crypto.randomBytes(24));
}
