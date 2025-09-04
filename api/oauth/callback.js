export const config = { runtime: 'nodejs20.x' };
// api/oauth/callback.js
import { kv } from '@vercel/kv';
import { randomId } from '../../lib/pkce.js';

const CANVA_CLIENT_ID = process.env.CANVA_CLIENT_ID;
const CANVA_CLIENT_SECRET = process.env.CANVA_CLIENT_SECRET;
const RELAY_BASE_URL = process.env.RELAY_BASE_URL;

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const oauthError = url.searchParams.get('error');
    const oauthErrorDesc = url.searchParams.get('error_description') || '';
    const code = url.searchParams.get('code');
    const sessionId = url.searchParams.get('state');

    // Quick env sanity
    if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET || !RELAY_BASE_URL) {
      console.error('[callback] Missing env', {
        hasId: !!CANVA_CLIENT_ID, hasSecret: !!CANVA_CLIENT_SECRET, hasRelay: !!RELAY_BASE_URL
      });
      return res.status(500).send('Server not configured: missing Canva env vars');
    }
    if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
      console.error('[callback] Missing KV env vars');
      return res.status(500).send('Server not configured: Vercel KV missing');
    }

    // Handle OAuth error from Canva (e.g., invalid_scope)
    if (oauthError) {
      console.error('[callback] Canva returned error', oauthError, oauthErrorDesc);
      if (sessionId) {
        const raw = await kv.get(sessionId);
        const session = raw ? JSON.parse(raw) : null;
        if (session?.chatgptRedirect) {
          const redirect = new URL(session.chatgptRedirect);
          redirect.searchParams.set('error', oauthError);
          redirect.searchParams.set('error_description', oauthErrorDesc);
          if (session.chatgptState) redirect.searchParams.set('state', session.chatgptState);
          res.writeHead(302, { Location: redirect.toString() });
          return res.end();
        }
      }
      return res.status(400).send(`Authorization failed: ${oauthError} – ${oauthErrorDesc}`);
    }

    // Must have code + state on success
    if (!code || !sessionId) {
      console.error('[callback] Missing code or state', { hasCode: !!code, sessionId });
      return res.status(400).send('Missing code or state');
    }

    // Load session (chatgptRedirect, chatgptState, codeVerifier)
    const raw = await kv.get(sessionId);
    if (!raw) {
      console.error('[callback] Session not found/expired', { sessionId });
      return res.status(400).send('Session not found or expired');
    }
    const session = JSON.parse(raw);
    if (!session.codeVerifier) {
      console.error('[callback] Missing codeVerifier in session');
      return res.status(400).send('PKCE verifier missing');
    }

    // Exchange code with Canva
    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${RELAY_BASE_URL}/api/oauth/callback`,
      code_verifier: session.codeVerifier
    });

    const tokenResp = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString('base64')
      },
      body: bodyParams
    });

    const text = await tokenResp.text();
    if (!tokenResp.ok) {
      console.error('[callback] Token exchange failed', tokenResp.status, text);
      return res
        .status(500)
        .send(`Token exchange failed (status ${tokenResp.status}). Body: ${text}`);
    }

    let tokenJson;
    try {
      tokenJson = JSON.parse(text);
    } catch (e) {
      console.error('[callback] Token JSON parse failed', text);
      return res.status(500).send('Tok
