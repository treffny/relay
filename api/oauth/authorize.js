
// api/oauth/authorize.js
export const config = { runtime: 'nodejs' };

import { kv } from '@vercel/kv';
import { generateCodeVerifier, codeChallengeS256, randomId } from '../../lib/pkce.js';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_SCOPES    = process.env.CANVA_SCOPES || 'design:content:read design:content:write';
const RELAY_BASE_URL  = process.env.RELAY_BASE_URL; // e.g. https://your-relay.vercel.app

export default async function handler(req, res) {
  try {
    if (!CANVA_CLIENT_ID || !RELAY_BASE_URL) {
      return res.status(500).send('Missing CANVA_CLIENT_ID or RELAY_BASE_URL');
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      return res.status(500).send('Server not configured: Vercel KV missing');
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const chatgptRedirect = url.searchParams.get('redirect_uri');
    const chatgptState    = url.searchParams.get('state') || '';
    if (!chatgptRedirect) return res.status(400).send('Missing redirect_uri from ChatGPT');

    const sessionId    = randomId('sess_');
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = codeChallengeS256(codeVerifier);

    // Store as an object (let @vercel/kv handle serialization)
    await kv.set(sessionId, {
      chatgptRedirect,
      chatgptState,
      codeVerifier,
      createdAt: Date.now()
    }, { ex: 600 });

    const canvaAuthorize = new URL('https://www.canva.com/api/oauth/authorize');
    canvaAuthorize.searchParams.set('response_type', 'code');
    canvaAuthorize.searchParams.set('client_id', CANVA_CLIENT_ID);
    canvaAuthorize.searchParams.set('redirect_uri', `${RELAY_BASE_URL}/api/oauth/callback`);
    canvaAuthorize.searchParams.set('scope', CANVA_SCOPES);
    canvaAuthorize.searchParams.set('state', sessionId);
    canvaAuthorize.searchParams.set('code_challenge', codeChallenge);
    canvaAuthorize.searchParams.set('code_challenge_method', 's256');

    res.writeHead(302, { Location: canvaAuthorize.toString() });
    res.end();
  } catch (err) {
    console.error('[authorize] error', err);
    res.status(500).send('Internal error in authorize');
  }
}

